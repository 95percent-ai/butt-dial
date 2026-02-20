/**
 * comms_transfer_call — MCP tool to transfer a live voice call to a human.
 *
 * During an active AI voice call, the agent can hand off to a real person
 * by providing the target phone number (or another agent ID).
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, sanitizationErrorResponse } from "../security/sanitizer.js";
import { checkRateLimits, logUsage, rateLimitErrorResponse, RateLimitError } from "../security/rate-limiter.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
}

export function registerTransferCallTool(server: McpServer): void {
  server.tool(
    "comms_transfer_call",
    "Transfer a live voice call to a human phone number or another agent. Ends the AI conversation and connects the caller to the target.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      callSid: z.string().describe("The Twilio Call SID of the active call to transfer"),
      to: z.string().describe("Target phone number (E.164) or agent ID to transfer to"),
      announcementText: z.string().optional().describe("Optional message to play before connecting the transfer"),
    },
    async ({ agentId: explicitAgentId, callSid, to, announcementText }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      // Auth
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      // Sanitize
      try {
        sanitize(callSid, "callSid");
        sanitize(to, "to");
        if (announcementText) sanitize(announcementText, "announcementText");
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
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      // Rate limit
      try {
        checkRateLimits(db, agentId, "voice_call", "voice", to, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        if (err instanceof RateLimitError) return rateLimitErrorResponse(err);
        throw err;
      }

      // Check if target is another agent — resolve to their phone number
      let targetNumber = to;
      if (!to.startsWith("+")) {
        const targetRows = db.query<AgentRow>(
          "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ? AND status = 'active'",
          [to]
        );
        if (targetRows.length > 0 && targetRows[0].phone_number) {
          targetNumber = targetRows[0].phone_number;
        } else {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Target agent "${to}" not found or has no phone number` }) }],
            isError: true,
          };
        }
      }

      // Transfer the call
      const telephony = getProvider("telephony");
      try {
        await telephony.transferCall({ callSid, to: targetNumber, announcementText });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("transfer_call_error", { agentId, callSid, to, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }

      // Log the transfer
      const logId = randomUUID();
      db.run(
        `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, transfer_to, org_id)
         VALUES (?, ?, ?, 'transfer', ?, ?, 'transferred', ?, ?)`,
        [logId, agentId, callSid, rows[0].phone_number || agentId, targetNumber, targetNumber, orgId]
      );

      logUsage(db, { agentId, actionType: "voice_transfer", channel: "voice", targetAddress: targetNumber, cost: 0, externalId: callSid });

      logger.info("transfer_call_success", { logId, agentId, callSid, to: targetNumber });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            logId,
            callSid,
            transferredTo: targetNumber,
            status: "transferred",
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_transfer_call" });
}
