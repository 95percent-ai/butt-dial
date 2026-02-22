/**
 * comms_make_call — MCP tool for initiating an outbound AI voice call.
 *
 * The agent calls a human. When the call connects, Twilio opens a
 * ConversationRelay WebSocket and the human has a live conversation
 * with an LLM-powered AI agent.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { storeCallConfig } from "../webhooks/voice-sessions.js";
import { getAgentLanguage } from "../lib/translator.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { checkTcpaTimeOfDay, checkDnc, checkContentFilter } from "../security/compliance.js";
import { applyGuardrails, applyDisclosure } from "../security/communication-guardrails.js";
import { resolveFromNumber } from "../lib/number-pool.js";
import { isChannelBlocked } from "../lib/channel-blocker.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
  blocked_channels: string | null;
}

/** Best-effort timezone from E.164 phone prefix. */
function inferTimezoneFromPhone(phone: string): string {
  if (phone.startsWith("+972")) return "Asia/Jerusalem";
  if (phone.startsWith("+852")) return "Asia/Hong_Kong";
  if (phone.startsWith("+86"))  return "Asia/Shanghai";
  if (phone.startsWith("+81"))  return "Asia/Tokyo";
  if (phone.startsWith("+44"))  return "Europe/London";
  if (phone.startsWith("+49"))  return "Europe/Berlin";
  if (phone.startsWith("+33"))  return "Europe/Paris";
  if (phone.startsWith("+61"))  return "Australia/Sydney";
  if (phone.startsWith("+91"))  return "Asia/Kolkata";
  return "America/New_York"; // default US
}

export function registerMakeCallTool(server: McpServer): void {
  server.tool(
    "comms_make_call",
    "Initiate an outbound AI voice call. The agent calls a human, and when the call connects, a live conversation begins with an LLM-powered AI agent.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      to: z.string().describe("Recipient phone number in E.164 format (e.g. +1234567890)"),
      systemPrompt: z
        .string()
        .optional()
        .describe("Custom instructions for the AI during this call"),
      greeting: z
        .string()
        .optional()
        .describe("What the AI says first when the call connects"),
      voice: z
        .string()
        .optional()
        .describe("TTS voice ID (default: ElevenLabs voice)"),
      language: z
        .string()
        .optional()
        .describe("Language code for STT/TTS (default: agent's language)"),
      recipientTimezone: z
        .string()
        .optional()
        .describe("Recipient's IANA timezone (e.g. Asia/Jerusalem, Europe/London). Auto-detected from phone prefix if omitted."),
    },
    async ({ agentId: explicitAgentId, to, systemPrompt, greeting, voice, language, recipientTimezone }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      try {
        sanitize(to, "to");
        if (systemPrompt) sanitize(systemPrompt, "systemPrompt");
        if (greeting) sanitize(greeting, "greeting");
      } catch (err) {
        return sanitizationErrorResponse(err);
      }

      const db = getProvider("database");

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (rows.length === 0) {
        logger.warn("make_call_agent_not_found", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      const agent = rows[0];

      const fromNumber = resolveFromNumber(db, agent.phone_number, to, "voice", orgId);
      if (!fromNumber) {
        logger.warn("make_call_no_phone", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number available (checked pool and agent)` }) }],
          isError: true,
        };
      }

      if (agent.status !== "active") {
        logger.warn("make_call_agent_inactive", { agentId, status: agent.status });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is not active (status: ${agent.status})` }) }],
          isError: true,
        };
      }

      if (isChannelBlocked(agent.blocked_channels, "voice")) {
        logger.warn("make_call_channel_blocked", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is blocked on voice channel` }) }],
          isError: true,
        };
      }

      try {
        checkRateLimits(db, agentId, "voice_call", "voice", to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      if (!config.demoMode) {
        const tz = recipientTimezone || inferTimezoneFromPhone(to);
        const tcpaCheck = checkTcpaTimeOfDay(tz);
        if (!tcpaCheck.allowed) {
          logger.warn("make_call_tcpa_blocked", { agentId, to, timezone: tz, reason: tcpaCheck.reason });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${tcpaCheck.reason}` }) }],
            isError: true,
          };
        }
      }

      const dncCheck = checkDnc(db, to, "phone");
      if (!dncCheck.allowed) {
        logger.warn("make_call_dnc_blocked", { agentId, to, reason: dncCheck.reason });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${dncCheck.reason}` }) }],
          isError: true,
        };
      }

      if (greeting) {
        const contentCheck = checkContentFilter(greeting);
        if (!contentCheck.allowed) {
          logger.warn("make_call_content_blocked", { agentId, reason: contentCheck.reason });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${contentCheck.reason}` }) }],
            isError: true,
          };
        }
      }

      const sessionId = randomUUID();
      const agentLang = getAgentLanguage(db, agentId);
      const callLang = language || agentLang;
      storeCallConfig(sessionId, {
        agentId,
        systemPrompt: applyGuardrails(systemPrompt || config.voiceDefaultSystemPrompt),
        greeting: applyDisclosure(greeting || config.voiceDefaultGreeting),
        voice: voice || config.voiceDefaultVoice,
        language: callLang,
        agentLanguage: agentLang,
      });

      const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agentId}/outbound-voice?session=${sessionId}`;

      const telephony = getProvider("telephony");

      let result;
      try {
        result = await telephony.makeCall({ from: fromNumber, to, webhookUrl });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("make_call_provider_error", { agentId, to, error: errMsg });
        // Queue to dead letters
        try {
          db.run(
            `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status)
             VALUES (?, ?, ?, 'voice', 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
            [randomUUID(), agentId, orgId, fromNumber, to, systemPrompt || null, JSON.stringify({ to, systemPrompt, greeting, voice, language }), errMsg]
          );
        } catch {}
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }

      // Log to call_logs table
      try {
        const callLogId = randomUUID();
        db.run(
          `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, org_id)
           VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
          [callLogId, agentId, result.callSid, fromNumber, to, result.status, orgId]
        );
      } catch {
        // Best-effort
      }

      logUsage(db, { agentId, actionType: "voice_call", channel: "voice", targetAddress: to, cost: 0, externalId: result.callSid });

      logger.info("make_call_success", {
        agentId, to,
        callSid: result.callSid, sessionId, status: result.status,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              callSid: result.callSid,
              sessionId,
              status: result.status,
              from: fromNumber,
              to,
            }, null, 2),
          },
        ],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_make_call" });
}
