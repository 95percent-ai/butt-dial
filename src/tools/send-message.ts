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
import { requireAgent, authErrorResponse, getOrgId, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, SanitizationError, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { metrics } from "../observability/metrics.js";
import { preSendCheck } from "../security/compliance.js";
import { translate, needsTranslation, getAgentLanguage } from "../lib/translator.js";
import { resolveFromNumber } from "../lib/number-pool.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  email_address: string | null;
  whatsapp_sender_sid: string | null;
  line_channel_id: string | null;
  status: string;
}

export function registerSendMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_message",
    "Send a message (SMS, email, WhatsApp, or LINE) from an agent to a recipient.",
    {
      agentId: z.string().describe("The agent ID that owns the sending address"),
      to: z.string().describe("Recipient address (phone number in E.164 for SMS/WhatsApp, or email address)"),
      body: z.string().describe("The message text to send"),
      channel: z.enum(["sms", "email", "whatsapp", "line"]).default("sms").describe("Channel to send via (default: sms)"),
      subject: z.string().optional().describe("Email subject line (required for email channel)"),
      html: z.string().optional().describe("Optional HTML body for email"),
      templateId: z.string().optional().describe("WhatsApp content template SID (e.g. HX...) for messages outside 24h window"),
      templateVars: z.record(z.string()).optional().describe("Template variable substitutions (e.g. {\"1\": \"John\"})"),
      targetLanguage: z.string().optional().describe("Language of the recipient (e.g. he-IL, es-MX). When different from agent's language, the message body is translated before sending."),
    },
    async ({ agentId, to, body, channel, subject, html, templateId, templateVars, targetLanguage }, extra) => {
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
      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);

      // Org boundary check
      try {
        requireAgentInOrg(db, agentId, authInfo);
      } catch (err) {
        return authErrorResponse(err);
      }

      // Look up the agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, email_address, whatsapp_sender_sid, line_channel_id, status FROM agent_channels WHERE agent_id = ?",
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
      const actionType = channel === "sms" ? "sms" : channel === "email" ? "email" : channel === "whatsapp" ? "whatsapp" : "line";
      try {
        checkRateLimits(db, agentId, actionType, channel, to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      // Compliance check (content filter, DNC, TCPA, CAN-SPAM)
      const compliance = preSendCheck(db, { channel, to, body, html });
      if (!compliance.allowed) {
        logger.warn("send_message_compliance_blocked", { agentId, to, channel, reason: compliance.reason });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${compliance.reason}` }) }],
          isError: true,
        };
      }

      // Translate outbound message if targetLanguage differs from agent's language
      let translatedBody = body;
      let bodyOriginal: string | undefined;
      const agentLang = getAgentLanguage(db, agentId);

      if (targetLanguage && needsTranslation(agentLang, targetLanguage)) {
        translatedBody = await translate(body, agentLang, targetLanguage);
        if (translatedBody !== body) {
          bodyOriginal = body;
          logger.info("outbound_message_translated", {
            agentId, channel, targetLanguage, agentLanguage: agentLang,
            originalLength: body.length, translatedLength: translatedBody.length,
          });
        }
      }

      // Route based on channel
      if (channel === "email") {
        return await sendEmail(db, agent, agentId, to, translatedBody, orgId, subject, html, bodyOriginal);
      } else if (channel === "whatsapp") {
        return await sendWhatsApp(db, agent, agentId, to, translatedBody, orgId, templateId, templateVars, bodyOriginal);
      } else if (channel === "line") {
        return await sendLine(db, agent, agentId, to, translatedBody, orgId, bodyOriginal);
      } else {
        return await sendSms(db, agent, agentId, to, translatedBody, orgId, bodyOriginal);
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
  orgId: string,
  bodyOriginal?: string,
) {
  // Smart routing: try number pool first, fall back to agent's own number
  const fromNumber = resolveFromNumber(db, agent.phone_number, to, "sms", orgId);
  if (!fromNumber) {
    logger.warn("send_message_no_phone", { agentId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number available (checked pool and agent)` }) }],
      isError: true,
    };
  }

  const telephony = getProvider("telephony");

  let result;
  try {
    result = await telephony.sendSms({
      from: fromNumber,
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
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, body_original, external_id, status, cost, org_id)
     VALUES (?, ?, 'sms', 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, fromNumber, to, body, bodyOriginal || null, result.messageId, result.status, result.cost ?? null, orgId]
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
        channel: "sms", from: fromNumber, to,
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
  orgId: string,
  subject?: string,
  html?: string,
  bodyOriginal?: string,
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
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, body_original, external_id, status, cost, org_id)
     VALUES (?, ?, 'email', 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agent.email_address, to, `[${subject}] ${body}`, bodyOriginal ? `[${subject}] ${bodyOriginal}` : null, result.messageId, result.status, result.cost ?? null, orgId]
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
  orgId: string,
  templateId?: string,
  templateVars?: Record<string, string>,
  bodyOriginal?: string,
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
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, body_original, external_id, status, cost, org_id)
     VALUES (?, ?, 'whatsapp', 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agent.whatsapp_sender_sid, to, body, bodyOriginal || null, result.messageId, result.status, result.cost ?? null, orgId]
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

async function sendLine(
  db: ReturnType<typeof getProvider<"database">>,
  agent: { agent_id: string; line_channel_id: string | null },
  agentId: string,
  to: string,
  body: string,
  orgId: string,
  bodyOriginal?: string,
) {
  if (!agent.line_channel_id) {
    logger.warn("send_message_no_line", { agentId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no LINE channel configured` }) }],
      isError: true,
    };
  }

  const line = getProvider("line");

  let result;
  try {
    result = await line.send({
      channelAccessToken: agent.line_channel_id,
      to,
      body,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "line", error: errMsg });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, body_original, external_id, status, cost, org_id)
     VALUES (?, ?, 'line', 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, agentId, agentId, to, body, bodyOriginal || null, result.messageId, result.status, result.cost ?? null, orgId]
  );

  logUsage(db, { agentId, actionType: "line", channel: "line", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "line" });

  logger.info("send_message_success", {
    messageId, agentId, to, channel: "line",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, messageId, externalId: result.messageId,
        status: result.status, cost: result.cost ?? null,
        channel: "line", from: agentId, to,
      }, null, 2),
    }],
  };
}
