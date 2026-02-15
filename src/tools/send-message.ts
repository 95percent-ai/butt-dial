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
import { requireAgent, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { sanitize, SanitizationError, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { metrics } from "../observability/metrics.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  email_address: string | null;
  whatsapp_sender_sid: string | null;
  status: string;
}

export function registerSendMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_message",
    "Send a message (SMS, email, or WhatsApp) from an agent to a recipient.",
    {
      agentId: z.string().describe("The agent ID that owns the sending address"),
      to: z.string().describe("Recipient address (phone number in E.164 for SMS/WhatsApp, or email address)"),
      body: z.string().describe("The message text to send"),
      channel: z.enum(["sms", "email", "whatsapp"]).default("sms").describe("Channel to send via (default: sms)"),
      subject: z.string().optional().describe("Email subject line (required for email channel)"),
      html: z.string().optional().describe("Optional HTML body for email"),
      templateId: z.string().optional().describe("WhatsApp content template SID (e.g. HX...) for messages outside 24h window"),
      templateVars: z.record(z.string()).optional().describe("Template variable substitutions (e.g. {\"1\": \"John\"})"),
    },
    async ({ agentId, to, body, channel, subject, html, templateId, templateVars }, extra) => {
      // Auth: agent can only send as themselves
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      // Sanitize inputs
      try {
        sanitize(body, "body");
        sanitize(to, "to");
      } catch (err) {
        return sanitizationErrorResponse(err);
      }

      const db = getProvider("database");

      // Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, email_address, whatsapp_sender_sid, status FROM agent_channels WHERE agent_id = ?",
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

      // Rate limit check (before any provider call)
      const actionType = channel === "sms" ? "sms" : channel === "email" ? "email" : "whatsapp";
      try {
        checkRateLimits(db, agentId, actionType, channel, to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      // Route based on channel
      if (channel === "email") {
        return await sendEmail(db, agent, agentId, to, body, subject, html);
      } else if (channel === "whatsapp") {
        return await sendWhatsApp(db, agent, agentId, to, body, templateId, templateVars);
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

  logUsage(db, { agentId, actionType: "sms", channel: "sms", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "sms" });

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

  logUsage(db, { agentId, actionType: "email", channel: "email", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "email" });

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

async function sendWhatsApp(
  db: ReturnType<typeof getProvider<"database">>,
  agent: { agent_id: string; whatsapp_sender_sid: string | null },
  agentId: string,
  to: string,
  body: string,
  templateId?: string,
  templateVars?: Record<string, string>,
) {
  if (!agent.whatsapp_sender_sid) {
    logger.warn("send_message_no_whatsapp", { agentId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no WhatsApp sender assigned` }) }],
      isError: true,
    };
  }

  const whatsapp = getProvider("whatsapp");

  let result;
  try {
    result = await whatsapp.send({
      from: agent.whatsapp_sender_sid,
      to,
      body,
      templateId,
      templateVars,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "whatsapp", error: errMsg });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, cost)
     VALUES (?, ?, 'whatsapp', 'outbound', ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agent.whatsapp_sender_sid, to, body, result.messageId, result.status, result.cost ?? null]
  );

  logUsage(db, { agentId, actionType: "whatsapp", channel: "whatsapp", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "whatsapp" });

  logger.info("send_message_success", {
    messageId, agentId, to, channel: "whatsapp",
    externalId: result.messageId, status: result.status,
    hasTemplate: !!templateId,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, messageId, externalId: result.messageId,
        status: result.status, cost: result.cost ?? null,
        channel: "whatsapp", from: agent.whatsapp_sender_sid, to,
      }, null, 2),
    }],
  };
}
