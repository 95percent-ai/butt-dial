/**
 * comms_expand_agent_pool — Admin tool to resize the agent pool.
 * Increases or decreases the maximum number of agents allowed.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAdmin, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";

interface PoolRow { max_agents: number; active_agents: number }

export function registerExpandAgentPoolTool(server: McpServer): void {
  server.tool(
    "comms_expand_agent_pool",
    "Resize the agent pool. Admin only. Set the maximum number of agents allowed.",
    {
      maxAgents: z.number().int().min(1).max(10000).describe("New maximum agent count"),
    },
    async ({ maxAgents }, extra) => {
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      // Get current state
      const rows = db.query<PoolRow>(
        "SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'"
      );
      const current = rows[0] || { max_agents: 5, active_agents: 0 };

      if (maxAgents < current.active_agents) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `Cannot reduce pool below active agent count (${current.active_agents} active). Deprovision agents first.`,
            }),
          }],
          isError: true,
        };
      }

      db.run(
        "UPDATE agent_pool SET max_agents = ?, updated_at = datetime('now') WHERE id = 'default'",
        [maxAgents]
      );

      logger.info("agent_pool_resized", {
        previous: current.max_agents,
        new: maxAgents,
        active: current.active_agents,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            pool: {
              maxAgents,
              activeAgents: current.active_agents,
              slotsRemaining: maxAgents - current.active_agents,
              previousMax: current.max_agents,
            },
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_expand_agent_pool" });
}
