/**
 * comms_get_me — MCP tool for "get me" secretary calls.
 *
 * Calls a target person on your behalf. An AI secretary asks if it's a
 * good time to talk. If yes — bridges the requester in via transfer_call.
 * If no — asks when and logs the answer in the transcript.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { storeCallConfig } from "../webhooks/voice-sessions.js";
import { getAgentLanguage } from "../lib/translator.js";
import { requireAgent, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";
import { checkTcpaTimeOfDay, checkDnc } from "../security/compliance.js";
import { applyGuardrails } from "../security/communication-guardrails.js";
import { resolveFromNumber } from "../lib/number-pool.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
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
  return "America/New_York";
}

function buildSecretaryPrompt(requesterName: string, targetName: string, requesterPhone: string, message?: string): string {
  const messageContext = message ? `\nContext: ${requesterName} wants to talk about: ${message}` : "";
  return `You are a phone secretary calling on behalf of ${requesterName}.
${requesterName} would like to speak with ${targetName}.${messageContext}

Your job:
1. Greet them and ask if now is a good time to talk.
2. If YES — say "Great, please hold while I connect you" and use the transfer_call tool to transfer to ${requesterPhone}.
3. If NO — ask when would be a better time, note their answer, thank them and say goodbye.

Keep it natural and brief — this is a phone call.`;
}

function buildGreeting(requesterName: string, targetName: string, message?: string): string {
  const msgPart = message ? ` ${message}.` : "";
  return `Hi${targetName ? ` ${targetName}` : ""}, I'm calling on behalf of ${requesterName}.${msgPart} Is this a good time to talk?`;
}

export function registerGetMeTool(server: McpServer): void {
  server.tool(
    "comms_get_me",
    "Secretary call — calls someone on your behalf. An AI asks if they're available, and if yes, bridges you into the call. If no, asks when would be better and logs it.",
    {
      agentId: z.string().describe("The agent ID that owns the calling phone number"),
      target: z.string().describe("Phone number to call in E.164 format (e.g. +972587050190)"),
      targetName: z.string().optional().describe("Name of the person being called (e.g. Guy)"),
      requesterPhone: z.string().describe("Your phone number — where to bridge the call if they say yes"),
      requesterName: z.string().optional().describe("Your name (e.g. Inon)"),
      message: z.string().optional().describe("Reason for the call — included in the greeting (e.g. 'He wants to discuss the proposal')"),
      recipientTimezone: z.string().optional().describe("Recipient's IANA timezone. Auto-detected from phone prefix if omitted."),
    },
    async ({ agentId, target, targetName, requesterPhone, requesterName, message, recipientTimezone }, extra) => {
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      try {
        sanitize(target, "target");
        sanitize(requesterPhone, "requesterPhone");
        if (targetName) sanitize(targetName, "targetName");
        if (requesterName) sanitize(requesterName, "requesterName");
        if (message) sanitize(message, "message");
      } catch (err) {
        return sanitizationErrorResponse(err);
      }

      const db = getProvider("database");
      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      // Look up agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }], isError: true };
      }

      const agent = rows[0];
      const fromNumber = resolveFromNumber(db, agent.phone_number, target, "voice", orgId);
      if (!fromNumber) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" has no phone number available` }) }], isError: true };
      }
      if (agent.status !== "active") {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is not active (status: ${agent.status})` }) }], isError: true };
      }

      // Rate limit
      try {
        checkRateLimits(db, agentId, "voice_call", "voice", target, authInfo);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      // TCPA
      if (!config.demoMode) {
        const tz = recipientTimezone || inferTimezoneFromPhone(target);
        const tcpaCheck = checkTcpaTimeOfDay(tz);
        if (!tcpaCheck.allowed) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${tcpaCheck.reason}` }) }], isError: true };
        }
      }

      // DNC
      const dncCheck = checkDnc(db, target, "phone");
      if (!dncCheck.allowed) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Compliance: ${dncCheck.reason}` }) }], isError: true };
      }

      // Build secretary prompt and greeting
      const callerName = requesterName || "your contact";
      const calleeName = targetName || "";
      const systemPrompt = buildSecretaryPrompt(callerName, calleeName || "the person", requesterPhone, message);
      const greeting = buildGreeting(callerName, calleeName, message);

      // Store call config with forceMode so it always uses answering-machine (Anthropic) path
      const sessionId = randomUUID();
      const agentLang = getAgentLanguage(db, agentId);
      storeCallConfig(sessionId, {
        agentId,
        systemPrompt: applyGuardrails(systemPrompt),
        greeting,
        voice: config.voiceDefaultVoice,
        language: agentLang,
        agentLanguage: agentLang,
        forceMode: "answering-machine",
      });

      // Place the call
      const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agentId}/outbound-voice?session=${sessionId}`;
      const telephony = getProvider("telephony");

      let result;
      try {
        result = await telephony.makeCall({ from: fromNumber, to: target, webhookUrl });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("get_me_call_error", { agentId, target, error: errMsg });
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }], isError: true };
      }

      // Log to messages table
      const messageId = randomUUID();
      db.run(
        `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, org_id)
         VALUES (?, ?, 'voice', 'outbound', ?, ?, ?, ?, ?, ?)`,
        [messageId, agentId, fromNumber, target, `[Get Me] ${callerName} → ${calleeName || target}`, result.callSid, result.status, orgId]
      );

      // Log to call_logs
      try {
        db.run(
          `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, org_id)
           VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
          [randomUUID(), agentId, result.callSid, fromNumber, target, result.status, orgId]
        );
      } catch { /* best effort */ }

      logUsage(db, { agentId, actionType: "voice_call", channel: "voice", targetAddress: target, cost: 0, externalId: result.callSid });

      logger.info("get_me_call_placed", { messageId, agentId, target, targetName, requesterPhone, requesterName, callSid: result.callSid, sessionId });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            messageId,
            callSid: result.callSid,
            sessionId,
            status: result.status,
            from: fromNumber,
            to: target,
            description: `Calling ${calleeName || target} on behalf of ${callerName}. If they're available, they'll be connected to ${requesterPhone}.`,
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_me" });
}
