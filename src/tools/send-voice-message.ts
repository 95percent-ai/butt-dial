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

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
}

export function registerSendVoiceMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_voice_message",
    "Place an outbound phone call that plays a pre-recorded voice message. Text is converted to speech via TTS, then Twilio calls the recipient and plays the audio.",
    {
      agentId: z.string().describe("The agent ID that owns the calling phone number"),
      to: z.string().describe("Recipient phone number in E.164 format (e.g. +1234567890)"),
      text: z.string().min(1).describe("The message text to convert to speech and play"),
      voice: z.string().optional().describe("TTS voice ID (optional, uses default if omitted)"),
    },
    async ({ agentId, to, text, voice }) => {
      const db = getProvider("database");

      // 1. Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ?",
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

      if (!agent.phone_number) {
        logger.warn("send_voice_no_phone", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number assigned` }) }],
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

      // 2. Synthesize speech via TTS provider
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

      // 3. Upload audio to storage
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

      // 4. Place outbound call with TwiML that plays the audio
      const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
      const telephony = getProvider("telephony");

      let callSid: string;
      let callStatus: string;

      try {
        const callResult = await telephony.makeCall({
          from: agent.phone_number,
          to,
          twiml,
        });
        callSid = callResult.callSid;
        callStatus = callResult.status;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("send_voice_call_error", { agentId, to, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Call failed: ${errMsg}` }) }],
          isError: true,
        };
      }

      // 5. Log to messages table
      const messageId = randomUUID();
      db.run(
        `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status)
         VALUES (?, ?, 'voice', 'outbound', ?, ?, ?, ?, ?)`,
        [messageId, agentId, agent.phone_number, to, text, callSid, callStatus]
      );

      logger.info("send_voice_success", {
        messageId,
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
              messageId,
              callSid,
              status: callStatus,
              from: agent.phone_number,
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
