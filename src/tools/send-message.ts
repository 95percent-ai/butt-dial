/**
 * comms_send_message — MCP tool for sending a message via SMS or email.
 * Looks up the agent, sends through the appropriate provider,
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
  email_address: string | null;
  status: string;
}

export function registerSendMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_message",
    "Send a message (SMS or email) from an agent to a recipient.",
    {
      agentId: z.string().describe("The agent ID that owns the sending address"),
      to: z.string().describe("Recipient address (phone number in E.164 for SMS, or email address)"),
      body: z.string().describe("The message text to send"),
      channel: z.enum(["sms", "email"]).default("sms").describe("Channel to send via (default: sms)"),
      subject: z.string().optional().describe("Email subject line (required for email channel)"),
      html: z.string().optional().describe("Optional HTML body for email"),
    },
    async ({ agentId, to, body, channel, subject, html }) => {
      const db = getProvider("database");

      // Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, email_address, status FROM agent_channels WHERE agent_id = ?",
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

      if (agent.status !== "active") {
        logger.warn("send_message_agent_inactive", { agentId, status: agent.status });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is not active (status: ${agent.status})` }) }],
          isError: true,
        };
      }

      // Route based on channel
      if (channel === "email") {
        return await sendEmail(db, agent, agentId, to, body, subject, html);
      } else {
        return await sendSms(db, agent, agentId, to, body);
      }
    }
  );

  logger.info("tool_registered", { name: "comms_send_message" });
}

async function sendSms(
  db: ReturnType<typeof getProvider<"database">>,
  agent: { agent_id: string; phone_number: string | null },
  agentId: string,
  to: string,
  body: string,
) {
  if (!agent.phone_number) {
    logger.warn("send_message_no_phone", { agentId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number assigned` }) }],
      isError: true,
    };
  }

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

  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, cost)
     VALUES (?, ?, 'sms', 'outbound', ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agent.phone_number, to, body, result.messageId, result.status, result.cost ?? null]
  );

  logger.info("send_message_success", {
    messageId, agentId, to, channel: "sms",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, messageId, externalId: result.messageId,
        status: result.status, cost: result.cost ?? null,
        channel: "sms", from: agent.phone_number, to,
      }, null, 2),
    }],
  };
}

async function sendEmail(
  db: ReturnType<typeof getProvider<"database">>,
  agent: { agent_id: string; email_address: string | null },
  agentId: string,
  to: string,
  body: string,
  subject?: string,
  html?: string,
) {
  if (!agent.email_address) {
    logger.warn("send_message_no_email", { agentId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no email address assigned` }) }],
      isError: true,
    };
  }

  if (!subject) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: "Subject is required for email channel" }) }],
      isError: true,
    };
  }

  const email = getProvider("email");

  let result;
  try {
    result = await email.send({
      from: agent.email_address,
      to,
      subject,
      body,
      html,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "email", error: errMsg });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, cost)
     VALUES (?, ?, 'email', 'outbound', ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agent.email_address, to, `[${subject}] ${body}`, result.messageId, result.status, result.cost ?? null]
  );

  logger.info("send_message_success", {
    messageId, agentId, to, channel: "email",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, messageId, externalId: result.messageId,
        status: result.status, cost: result.cost ?? null,
        channel: "email", from: agent.email_address, to, subject,
      }, null, 2),
    }],
  };
}
