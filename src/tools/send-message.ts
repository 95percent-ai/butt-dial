/**
 * comms_send_message — MCP tool for sending a message via SMS, email, WhatsApp, or LINE.
 * Looks up the agent, sends through the appropriate provider.
 * On success: nothing stored (usage_logs tracks counts/costs via logUsage).
 * On failure: queues to dead_letters for retry.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, authErrorResponse, getOrgId, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, SanitizationError, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { metrics } from "../observability/metrics.js";
import { preSendCheck } from "../security/compliance.js";
import { resolveFromNumber } from "../lib/number-pool.js";
import { maybeTriggerSandboxReply } from "../lib/sandbox-responder.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  email_address: string | null;
  whatsapp_sender_sid: string | null;
  line_channel_id: string | null;
  status: string;
}

/** Queue a failed outbound send to the dead_letters table */
function queueDeadLetter(db: ReturnType<typeof getProvider<"database">>, params: {
  agentId: string; orgId: string; channel: string; from: string; to: string;
  body: string; error: string; originalRequest?: Record<string, unknown>;
}): void {
  try {
    db.run(
      `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status)
       VALUES (?, ?, ?, ?, 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
      [randomUUID(), params.agentId, params.orgId, params.channel, params.from, params.to, params.body, params.originalRequest ? JSON.stringify(params.originalRequest) : null, params.error]
    );
  } catch (err) {
    logger.error("dead_letter_queue_error", { agentId: params.agentId, error: String(err) });
  }
}

export function registerSendMessageTool(server: McpServer): void {
  server.tool(
    "comms_send_message",
    "Send a message (SMS, email, WhatsApp, or LINE) from an agent to a recipient.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      to: z.string().describe("Recipient address (phone number in E.164 for SMS/WhatsApp, or email address)"),
      body: z.string().describe("The message text to send"),
      channel: z.enum(["sms", "email", "whatsapp", "line"]).default("sms").describe("Channel to send via (default: sms)"),
      subject: z.string().optional().describe("Email subject line (required for email channel)"),
      html: z.string().optional().describe("Optional HTML body for email"),
      templateId: z.string().optional().describe("WhatsApp content template SID (e.g. HX...) for messages outside 24h window"),
      templateVars: z.record(z.string()).optional().describe("Template variable substitutions (e.g. {\"1\": \"John\"})"),
    },
    async ({ agentId: explicitAgentId, to, body, channel, subject, html, templateId, templateVars }, extra) => {
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
        sanitize(body, "body");
        sanitize(to, "to");
      } catch (err) {
        return sanitizationErrorResponse(err);
      }

      const db = getProvider("database");
      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);

      try {
        requireAgentInOrg(db, agentId, authInfo);
      } catch (err) {
        return authErrorResponse(err);
      }

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

      const actionType = channel === "sms" ? "sms" : channel === "email" ? "email" : channel === "whatsapp" ? "whatsapp" : "line";
      try {
        checkRateLimits(db, agentId, actionType, channel, to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      const compliance = preSendCheck(db, { channel, to, body, html });
      if (!compliance.allowed) {
        logger.warn("send_message_compliance_blocked", { agentId, to, channel, reason: compliance.reason });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${compliance.reason}` }) }],
          isError: true,
        };
      }

      if (channel === "email") {
        return await sendEmail(db, agent, agentId, to, body, orgId, subject, html);
      } else if (channel === "whatsapp") {
        return await sendWhatsApp(db, agent, agentId, to, body, orgId, templateId, templateVars);
      } else if (channel === "line") {
        return await sendLine(db, agent, agentId, to, body, orgId);
      } else {
        return await sendSms(db, agent, agentId, to, body, orgId);
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
) {
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
    result = await telephony.sendSms({ from: fromNumber, to, body });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, error: errMsg });
    queueDeadLetter(db, { agentId, orgId, channel: "sms", from: fromNumber, to, body, error: errMsg, originalRequest: { to, body, channel: "sms" } });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  logUsage(db, { agentId, actionType: "sms", channel: "sms", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "sms" });
  maybeTriggerSandboxReply({ orgId, agentId, channel: "sms", to, from: fromNumber, body });

  logger.info("send_message_success", {
    agentId, to, channel: "sms",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, externalId: result.messageId,
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
) {
  if (!agent.email_address) {
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
    result = await email.send({ from: agent.email_address, to, subject, body, html });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "email", error: errMsg });
    queueDeadLetter(db, { agentId, orgId, channel: "email", from: agent.email_address, to, body: `[${subject}] ${body}`, error: errMsg, originalRequest: { to, body, channel: "email", subject, html } });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  logUsage(db, { agentId, actionType: "email", channel: "email", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "email" });
  maybeTriggerSandboxReply({ orgId, agentId, channel: "email", to, from: agent.email_address!, body });

  logger.info("send_message_success", {
    agentId, to, channel: "email",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, externalId: result.messageId,
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
) {
  if (!agent.whatsapp_sender_sid) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no WhatsApp sender assigned` }) }],
      isError: true,
    };
  }

  const whatsapp = getProvider("whatsapp");

  let result;
  try {
    result = await whatsapp.send({ from: agent.whatsapp_sender_sid, to, body, templateId, templateVars });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "whatsapp", error: errMsg });
    queueDeadLetter(db, { agentId, orgId, channel: "whatsapp", from: agent.whatsapp_sender_sid, to, body, error: errMsg, originalRequest: { to, body, channel: "whatsapp", templateId, templateVars } });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  logUsage(db, { agentId, actionType: "whatsapp", channel: "whatsapp", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "whatsapp" });
  maybeTriggerSandboxReply({ orgId, agentId, channel: "whatsapp", to, from: agent.whatsapp_sender_sid!, body });

  logger.info("send_message_success", {
    agentId, to, channel: "whatsapp",
    externalId: result.messageId, status: result.status,
    hasTemplate: !!templateId,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, externalId: result.messageId,
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
) {
  if (!agent.line_channel_id) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no LINE channel configured` }) }],
      isError: true,
    };
  }

  const line = getProvider("line");

  let result;
  try {
    result = await line.send({ channelAccessToken: agent.line_channel_id, to, body });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("send_message_provider_error", { agentId, to, channel: "line", error: errMsg });
    queueDeadLetter(db, { agentId, orgId, channel: "line", from: agentId, to, body, error: errMsg, originalRequest: { to, body, channel: "line" } });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
      isError: true,
    };
  }

  logUsage(db, { agentId, actionType: "line", channel: "line", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
  metrics.increment("mcp_messages_sent_total", { channel: "line" });
  maybeTriggerSandboxReply({ orgId, agentId, channel: "line", to, from: agentId, body });

  logger.info("send_message_success", {
    agentId, to, channel: "line",
    externalId: result.messageId, status: result.status,
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: true, externalId: result.messageId,
        status: result.status, cost: result.cost ?? null,
        channel: "line", from: agentId, to,
      }, null, 2),
    }],
  };
}
