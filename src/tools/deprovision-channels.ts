/**
 * comms_deprovision_channels — MCP tool for tearing down an agent.
 * Releases phone number, returns WhatsApp to pool, marks agent deprovisioned.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { releasePhoneNumber } from "../provisioning/phone-number.js";
import { returnToPool } from "../provisioning/whatsapp-sender.js";
import { requireAdmin, getOrgId, resolveAgentId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { revokeAgentTokens } from "../security/token-manager.js";
import { appendAuditLog } from "../observability/audit-log.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  whatsapp_sender_sid: string | null;
  status: string;
}

export function registerDeprovisionChannelsTool(server: McpServer): void {
  server.tool(
    "comms_deprovision_channels",
    "Deprovision an agent — release phone number, return WhatsApp to pool, mark channels inactive.",
    {
      agentId: z.string().optional().describe("The agent ID to deprovision (auto-detected from token if omitted)"),
      releaseNumber: z.boolean().default(true).describe("Whether to release the phone number back to Twilio (default: true)"),
    },
    async ({ agentId: explicitAgentId, releaseNumber: shouldRelease }, extra) => {
      // Auth: only admin can deprovision
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const agentId = resolveAgentId(authInfo, explicitAgentId);
      if (!agentId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (pass it explicitly or use an agent token)" }) }],
          isError: true,
        };
      }

      const db = getProvider("database");

      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      // 1. Look up agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, phone_number, whatsapp_sender_sid, status FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      const agent = rows[0];

      if (agent.status === "deprovisioned") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" is already deprovisioned` }) }],
          isError: true,
        };
      }

      const warnings: string[] = [];

      // 2. Release phone number (non-fatal on failure)
      if (shouldRelease && agent.phone_number) {
        try {
          await releasePhoneNumber(agent.phone_number);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to release phone number: ${errMsg}`);
          logger.warn("deprovision_release_number_failed", { agentId, error: errMsg });
        }
      }

      // 3. Return WhatsApp to pool
      if (agent.whatsapp_sender_sid) {
        returnToPool(db, agentId);
      }

      // 4. Revoke all tokens for this agent
      const tokensRevoked = revokeAgentTokens(db, agentId);
      if (tokensRevoked > 0) {
        logger.info("agent_tokens_revoked", { agentId, count: tokensRevoked });
      }

      // 5. Delete spending limits
      db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]);

      // 6. Update agent_channels status
      db.run(
        "UPDATE agent_channels SET status = 'deprovisioned', updated_at = datetime('now') WHERE agent_id = ?",
        [agentId]
      );

      // 7. Decrement pool
      db.run(
        "UPDATE agent_pool SET active_agents = MAX(0, active_agents - 1), updated_at = datetime('now') WHERE id = 'default'"
      );

      appendAuditLog(db, {
        eventType: "agent_deprovisioned",
        actor: "admin",
        target: agentId,
        details: { numberReleased: shouldRelease && !!agent.phone_number, whatsappReturned: !!agent.whatsapp_sender_sid },
      });

      logger.info("agent_deprovisioned", { agentId });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            agentId,
            status: "deprovisioned",
            numberReleased: shouldRelease && !!agent.phone_number,
            whatsappReturned: !!agent.whatsapp_sender_sid,
            warnings: warnings.length > 0 ? warnings : undefined,
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_deprovision_channels" });
}
