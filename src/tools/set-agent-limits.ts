/**
 * comms_set_agent_limits — Admin-only tool to set per-agent rate/spending limits.
 * Partial update — only provided fields are changed.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAdmin, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { getAgentLimits } from "../security/rate-limiter.js";

interface AgentRow { agent_id: string }
interface SpendingRow {
  agent_id: string;
  max_actions_per_minute: number;
  max_actions_per_hour: number;
  max_actions_per_day: number;
  max_spend_per_day: number;
  max_spend_per_month: number;
}

export function registerSetAgentLimitsTool(server: McpServer): void {
  server.tool(
    "comms_set_agent_limits",
    "Configure rate limits and spending caps for an agent. Admin only. All fields are optional — only provided fields are updated.",
    {
      agentId: z.string().describe("The agent to configure"),
      limits: z.object({
        maxActionsPerMinute: z.number().int().positive().optional().describe("Max actions per minute"),
        maxActionsPerHour: z.number().int().positive().optional().describe("Max actions per hour"),
        maxActionsPerDay: z.number().int().positive().optional().describe("Max actions per day"),
        maxSpendPerDay: z.number().nonnegative().optional().describe("Max daily spend in USD"),
        maxSpendPerMonth: z.number().nonnegative().optional().describe("Max monthly spend in USD"),
      }).describe("Limits to set (partial — only provided fields change)"),
    },
    async ({ agentId, limits }, extra) => {
      // Auth: admin only
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      // Verify agent exists
      const agents = db.query<AgentRow>(
        "SELECT agent_id FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );
      if (agents.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      // Check if row exists
      const existing = db.query<SpendingRow>(
        "SELECT * FROM spending_limits WHERE agent_id = ?",
        [agentId]
      );

      if (existing.length === 0) {
        // Insert new row with provided overrides
        const id = randomUUID();
        db.run(
          `INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            agentId,
            limits.maxActionsPerMinute ?? 10,
            limits.maxActionsPerHour ?? 100,
            limits.maxActionsPerDay ?? 500,
            limits.maxSpendPerDay ?? 10,
            limits.maxSpendPerMonth ?? 100,
          ]
        );
      } else {
        // Partial update — only change provided fields
        const sets: string[] = [];
        const params: unknown[] = [];

        if (limits.maxActionsPerMinute !== undefined) {
          sets.push("max_actions_per_minute = ?");
          params.push(limits.maxActionsPerMinute);
        }
        if (limits.maxActionsPerHour !== undefined) {
          sets.push("max_actions_per_hour = ?");
          params.push(limits.maxActionsPerHour);
        }
        if (limits.maxActionsPerDay !== undefined) {
          sets.push("max_actions_per_day = ?");
          params.push(limits.maxActionsPerDay);
        }
        if (limits.maxSpendPerDay !== undefined) {
          sets.push("max_spend_per_day = ?");
          params.push(limits.maxSpendPerDay);
        }
        if (limits.maxSpendPerMonth !== undefined) {
          sets.push("max_spend_per_month = ?");
          params.push(limits.maxSpendPerMonth);
        }

        if (sets.length > 0) {
          sets.push("updated_at = datetime('now')");
          params.push(agentId);
          db.run(
            `UPDATE spending_limits SET ${sets.join(", ")} WHERE agent_id = ?`,
            params
          );
        }
      }

      // Return current limits
      const current = getAgentLimits(db, agentId);

      logger.info("agent_limits_updated", { agentId, limits });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            agentId,
            currentLimits: current,
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_set_agent_limits" });
}
