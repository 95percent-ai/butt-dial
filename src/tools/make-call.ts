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

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
}

export function registerMakeCallTool(server: McpServer): void {
  server.tool(
    "comms_make_call",
    "Initiate an outbound AI voice call. The agent calls a human, and when the call connects, a live conversation begins with an LLM-powered AI agent.",
    {
      agentId: z.string().describe("The agent ID that owns the calling phone number"),
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
        .describe("Language code (default: en-US)"),
    },
    async ({ agentId, to, systemPrompt, greeting, voice, language }) => {
      const db = getProvider("database");

      // Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ?",
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

      if (!agent.phone_number) {
        logger.warn("make_call_no_phone", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number assigned` }) }],
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

      // Store call config in session store so the outbound webhook can read it
      const sessionId = randomUUID();
      storeCallConfig(sessionId, {
        agentId,
        systemPrompt: systemPrompt || config.voiceDefaultSystemPrompt,
        greeting: greeting || config.voiceDefaultGreeting,
        voice: voice || config.voiceDefaultVoice,
        language: language || config.voiceDefaultLanguage,
      });

      // Build the webhook URL that Twilio will hit when the call connects
      const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agentId}/outbound-voice?session=${sessionId}`;

      // Place the call
      const telephony = getProvider("telephony");

      let result;
      try {
        result = await telephony.makeCall({
          from: agent.phone_number,
          to,
          webhookUrl,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("make_call_provider_error", { agentId, to, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }

      // Log to messages table
      const messageId = randomUUID();
      db.run(
        `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status)
         VALUES (?, ?, 'voice', 'outbound', ?, ?, ?, ?, ?)`,
        [messageId, agentId, agent.phone_number, to, systemPrompt || null, result.callSid, result.status]
      );

      logger.info("make_call_success", {
        messageId,
        agentId,
        to,
        callSid: result.callSid,
        sessionId,
        status: result.status,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              messageId,
              callSid: result.callSid,
              sessionId,
              status: result.status,
              from: agent.phone_number,
              to,
            }, null, 2),
          },
        ],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_make_call" });
}
