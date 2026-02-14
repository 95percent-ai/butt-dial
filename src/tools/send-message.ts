/**
 * comms_send_message — MCP tool for sending an SMS via an agent's phone number.
 * Looks up the agent, sends the message through the telephony provider,
 * and logs the result in the messages table.
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

export function registerSendMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_message",
    "Send an SMS message from an agent's phone number to a recipient.",
    {
      agentId: z.string().describe("The agent ID that owns the sending phone number"),
      to: z.string().describe("Recipient phone number in E.164 format (e.g. +1234567890)"),
      body: z.string().describe("The message text to send"),
    },
    async ({ agentId, to, body }) => {
      const db = getProvider("database");

      // Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (rows.length === 0) {
        logger.warn("send_message_agent_not_found", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      const agent = rows[0];

      if (!agent.phone_number) {
        logger.warn("send_message_no_phone", { agentId });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number assigned` }) }],
          isError: true,
        };
      }

      if (agent.status !== "active") {
        logger.warn("send_message_agent_inactive", { agentId, status: agent.status });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is not active (status: ${agent.status})` }) }],
          isError: true,
        };
      }

      // Send SMS via telephony provider
      const telephony = getProvider("telephony");

      let result;
      try {
        result = await telephony.sendSms({
          from: agent.phone_number,
          to,
          body,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("send_message_provider_error", { agentId, to, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }

      // Log to messages table
      const messageId = randomUUID();
      db.run(
        `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, cost)
         VALUES (?, ?, 'sms', 'outbound', ?, ?, ?, ?, ?, ?)`,
        [messageId, agentId, agent.phone_number, to, body, result.messageId, result.status, result.cost ?? null]
      );

      logger.info("send_message_success", {
        messageId,
        agentId,
        to,
        externalId: result.messageId,
        status: result.status,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              messageId,
              externalId: result.messageId,
              status: result.status,
              cost: result.cost ?? null,
              from: agent.phone_number,
              to,
            }, null, 2),
          },
        ],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_send_message" });
}
