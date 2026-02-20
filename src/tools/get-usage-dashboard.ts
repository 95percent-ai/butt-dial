/**
 * comms_get_usage_dashboard — Usage stats, costs, and limits per agent.
 * Admin sees all agents; agent sees only themselves.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, isSuperAdmin, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { orgFilter } from "../security/org-scope.js";
import { getAgentLimits } from "../security/rate-limiter.js";
import { config } from "../lib/config.js";

interface ActionCountRow { action_type: string; cnt: number }
interface CostRow { channel: string; total_cost: number }
interface AgentIdRow { agent_id: string }

export function registerGetUsageDashboardTool(server: McpServer): void {
  server.tool(
    "comms_get_usage_dashboard",
    "Get usage statistics, costs, and rate limits for an agent. Admin sees all agents; agents see only their own data.",
    {
      agentId: z.string().optional().describe("Agent ID (required for agents, optional for admin — omit to see all)"),
      period: z.enum(["today", "week", "month", "all"]).default("today").describe("Time period for stats"),
    },
    async ({ agentId: explicitAgentId, period }, extra) => {
      const authInfo = extra.authInfo as AuthInfo | undefined;
      const agentId = resolveAgentId(authInfo, explicitAgentId);
      const isAdmin = config.demoMode || authInfo?.scopes?.includes("admin");

      // If agentId provided, check access
      if (agentId) {
        try {
          requireAgent(agentId, authInfo);
        } catch (err) {
          return authErrorResponse(err);
        }
      } else if (!isAdmin) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required for non-admin users" }) }],
          isError: true,
        };
      }

      const db = getProvider("database");

      // Build time filter
      let timeFilter: string;
      switch (period) {
        case "today":
          timeFilter = "created_at >= date('now')";
          break;
        case "week":
          timeFilter = "created_at >= date('now', '-7 days')";
          break;
        case "month":
          timeFilter = "created_at >= date('now', 'start of month')";
          break;
        case "all":
          timeFilter = "1=1";
          break;
      }

      if (agentId) {
        // Single agent dashboard
        const dashboard = buildAgentDashboard(db, agentId, timeFilter, period);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(dashboard, null, 2) }],
        };
      }

      // Admin: all agents (org-scoped)
      const org = orgFilter(authInfo);
      let agentQuery = "SELECT DISTINCT agent_id FROM agent_channels WHERE status = 'active'";
      const agentParams: unknown[] = [];
      if (org.clause) {
        agentQuery += ` AND ${org.clause}`;
        agentParams.push(...org.params);
      }
      const agents = db.query<AgentIdRow>(agentQuery, agentParams);

      const agentDashboards = agents.map(a =>
        buildAgentDashboard(db, a.agent_id, timeFilter, period)
      );

      // Global totals (org-scoped)
      let globalActionsQuery = `SELECT COUNT(*) as cnt FROM usage_logs WHERE ${timeFilter}`;
      const globalActionsParams: unknown[] = [];
      if (org.clause) {
        globalActionsQuery += ` AND ${org.clause}`;
        globalActionsParams.push(...org.params);
      }
      const globalActions = db.query<{ cnt: number }>(globalActionsQuery, globalActionsParams)[0]?.cnt ?? 0;

      let globalCostQuery = `SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE ${timeFilter}`;
      const globalCostParams: unknown[] = [];
      if (org.clause) {
        globalCostQuery += ` AND ${org.clause}`;
        globalCostParams.push(...org.params);
      }
      const globalCost = db.query<{ total: number | null }>(globalCostQuery, globalCostParams)[0]?.total ?? 0;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            period,
            globalTotals: {
              totalActions: globalActions,
              totalCost: Math.round(globalCost * 10000) / 10000,
            },
            agents: agentDashboards,
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_usage_dashboard" });
}

function buildAgentDashboard(
  db: ReturnType<typeof getProvider<"database">>,
  agentId: string,
  timeFilter: string,
  period: string,
) {
  // Action counts by type
  const actionCounts = db.query<ActionCountRow>(
    `SELECT action_type, COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND ${timeFilter} GROUP BY action_type`,
    [agentId]
  );

  // Costs by channel
  const costs = db.query<CostRow>(
    `SELECT channel, COALESCE(SUM(cost), 0) as total_cost FROM usage_logs WHERE agent_id = ? AND ${timeFilter} GROUP BY channel`,
    [agentId]
  );

  // Total actions & cost
  const totalActions = actionCounts.reduce((sum, r) => sum + r.cnt, 0);
  const totalCost = costs.reduce((sum, r) => sum + r.total_cost, 0);

  // Current limits
  const limits = getAgentLimits(db, agentId);

  // Today's usage for current rate context
  const todayActions = db.query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')",
    [agentId]
  )[0]?.cnt ?? 0;

  const todaySpend = db.query<{ total: number | null }>(
    "SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')",
    [agentId]
  )[0]?.total ?? 0;

  const monthSpend = db.query<{ total: number | null }>(
    "SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now', 'start of month')",
    [agentId]
  )[0]?.total ?? 0;

  return {
    agentId,
    period,
    actions: Object.fromEntries(actionCounts.map(r => [r.action_type, r.cnt])),
    totalActions,
    costsByChannel: Object.fromEntries(costs.map(r => [r.channel, Math.round(r.total_cost * 10000) / 10000])),
    totalCost: Math.round(totalCost * 10000) / 10000,
    currentUsage: {
      actionsToday: todayActions,
      actionsLimit: limits.maxActionsPerDay,
      spendToday: Math.round(todaySpend * 10000) / 10000,
      spendDayLimit: limits.maxSpendPerDay,
      spendMonth: Math.round((monthSpend ?? 0) * 10000) / 10000,
      spendMonthLimit: limits.maxSpendPerMonth,
    },
    limits,
  };
}
