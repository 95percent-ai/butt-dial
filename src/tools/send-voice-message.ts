/**
 * comms_send_voice_message — MCP tool for placing an outbound phone call
 * that plays a pre-recorded voice message (TTS).
 *
 * Flow: TTS synthesis → upload to storage → Twilio call with <Play> TwiML → DB log.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { resolveFromNumber } from "../lib/number-pool.js";
import { isChannelBlocked } from "../lib/channel-blocker.js";
import { getAgentGender, buildGenderInstructions } from "../lib/gender-context.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
  blocked_channels: string | null;
}

export function registerSendVoiceMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_voice_message",
    "Place an outbound phone call that plays a pre-recorded voice message. Text is converted to speech via TTS, then Twilio calls the recipient and plays the audio.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      to: z.string().describe("Recipient phone number in E.164 format (e.g. +1234567890)"),
      text: z.string().min(1).describe("The message text to convert to speech and play"),
      voice: z.string().optional().describe("TTS voice ID (optional, uses default if omitted)"),
      targetGender: z.enum(["male", "female", "unknown"]).optional().describe("Gender of the recipient — used for correct conjugation in gendered languages"),
    },
    async ({ agentId: explicitAgentId, to, text, voice, targetGender }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      // Auth: agent can only call as themselves
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      // Sanitize inputs
      try {
        sanitize(text, "text");
        sanitize(to, "to");
      } catch (err) {
        return sanitizationErrorResponse(err);
      }

      const db = getProvider("database");

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      // 1. Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (rows.length === 0) {
        logger.warn("send_voice_agent_not_found", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      const agent = rows[0];

      // Smart routing: try number pool first, fall back to agent's own number
      const fromNumber = resolveFromNumber(db, agent.phone_number, to, "voice", orgId);
      if (!fromNumber) {
        logger.warn("send_voice_no_phone", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number available (checked pool and agent)` }) }],
          isError: true,
        };
      }

      if (agent.status !== "active") {
        logger.warn("send_voice_agent_inactive", { agentId, status: agent.status });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is not active (status: ${agent.status})` }) }],
          isError: true,
        };
      }

      if (isChannelBlocked(agent.blocked_channels, "voice")) {
        logger.warn("send_voice_channel_blocked", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is blocked on voice channel` }) }],
          isError: true,
        };
      }

      // 2. Rate limit check
      try {
        checkRateLimits(db, agentId, "voice_message", "voice", to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      // 3. Synthesize speech via TTS provider
      const tts = getProvider("tts");
      let audioBuffer: Buffer;
      let durationSeconds: number;

      try {
        const ttsResult = await tts.synthesize({ text, voice, outputFormat: "ulaw_8000" });
        audioBuffer = ttsResult.audioBuffer;
        durationSeconds = ttsResult.durationSeconds;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("send_voice_tts_error", { agentId, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `TTS failed: ${errMsg}` }) }],
          isError: true,
        };
      }

      // 4. Upload audio to storage
      const storage = getProvider("storage");
      const audioKey = `voice-${randomUUID()}.wav`;
      let audioUrl: string;

      try {
        audioUrl = await storage.upload(audioKey, audioBuffer, "audio/wav");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("send_voice_storage_error", { agentId, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Storage upload failed: ${errMsg}` }) }],
          isError: true,
        };
      }

      // 5. Place outbound call with TwiML that plays the audio
      const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
      const telephony = getProvider("telephony");

      let callSid: string;
      let callStatus: string;

      try {
        const callResult = await telephony.makeCall({
          from: fromNumber,
          to,
          twiml,
        });
        callSid = callResult.callSid;
        callStatus = callResult.status;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("send_voice_call_error", { agentId, to, error: errMsg });
        // Queue to dead letters
        try {
          db.run(
            `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status)
             VALUES (?, ?, ?, 'voice', 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
            [randomUUID(), agentId, orgId, fromNumber, to, text, JSON.stringify({ to, text, voice }), errMsg]
          );
        } catch {}
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Call failed: ${errMsg}` }) }],
          isError: true,
        };
      }

      // 6. Log usage (no message storage — usage_logs tracks counts)
      logUsage(db, { agentId, actionType: "voice_message", channel: "voice", targetAddress: to, cost: 0, externalId: callSid });

      logger.info("send_voice_success", {
        agentId,
        to,
        callSid,
        callStatus,
        audioUrl,
        durationSeconds,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              callSid,
              status: callStatus,
              from: fromNumber,
              to,
              audioUrl,
              durationSeconds,
            }, null, 2),
          },
        ],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_send_voice_message" });
}
