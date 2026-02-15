/**
 * comms_get_billing_summary — Shows provider costs vs billed costs with markup.
 * comms_set_billing_config — Admin tool to set per-agent tier and markup.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { requireAgent, requireAdmin, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import {
  getBillingSummary,
  getAgentBillingConfig,
  setAgentBillingConfig,
  getAvailableTiers,
  getTierLimits,
} from "../lib/billing.js";

interface AgentIdRow { agent_id: string }

export function registerBillingTools(server: McpServer): void {
  // ── Billing Summary ──────────────────────────────────────────────
  server.tool(
    "comms_get_billing_summary",
    "Get billing summary showing provider costs, markup, and billed costs. Agents see their own data; admin can see any agent or all agents.",
    {
      agentId: z.string().optional().describe("Agent ID (required for agents, optional for admin — omit to see all)"),
      period: z.enum(["today", "week", "month", "all"]).default("month").describe("Time period for billing"),
    },
    async ({ agentId, period }, extra) => {
      const authInfo = extra.authInfo as AuthInfo | undefined;
      const isAdmin = config.demoMode || authInfo?.scopes?.includes("admin");

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
        const summary = getBillingSummary(db, agentId, timeFilter);
        const billingConfig = getAgentBillingConfig(db, agentId);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              agentId,
              period,
              ...summary,
              billingConfig,
            }, null, 2),
          }],
        };
      }

      // Admin: all agents
      const agents = db.query<AgentIdRow>(
        "SELECT DISTINCT agent_id FROM agent_channels WHERE status = 'active'"
      );

      const agentSummaries = agents.map(a => ({
        agentId: a.agent_id,
        ...getBillingSummary(db, a.agent_id, timeFilter),
      }));

      const totalProvider = agentSummaries.reduce((s, a) => s + a.providerCost, 0);
      const totalBilling = agentSummaries.reduce((s, a) => s + a.billingCost, 0);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            period,
            globalMarkupPercent: config.billingMarkupPercent,
            totals: {
              providerCost: Math.round(totalProvider * 10000) / 10000,
              billingCost: Math.round(totalBilling * 10000) / 10000,
              revenue: Math.round((totalBilling - totalProvider) * 10000) / 10000,
            },
            agents: agentSummaries,
          }, null, 2),
        }],
      };
    }
  );

  // ── Set Billing Config ───────────────────────────────────────────
  server.tool(
    "comms_set_billing_config",
    "Configure billing settings for an agent — tier, markup percentage, billing email. Admin only.",
    {
      agentId: z.string().describe("The agent to configure"),
      tier: z.enum(["free", "starter", "pro", "enterprise"]).optional().describe("Billing tier"),
      markupPercent: z.number().min(0).max(500).optional().describe("Markup percentage (0-500)"),
      billingEmail: z.string().email().optional().describe("Billing email for invoices"),
    },
    async ({ agentId, tier, markupPercent, billingEmail }, extra) => {
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      // Verify agent exists
      const agents = db.query<{ agent_id: string }>(
        "SELECT agent_id FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );
      if (agents.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      setAgentBillingConfig(db, agentId, { tier, markupPercent, billingEmail });

      const updated = getAgentBillingConfig(db, agentId);
      const tierLimits = getTierLimits(updated.tier);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            agentId,
            billingConfig: updated,
            tierLimits,
            availableTiers: getAvailableTiers(),
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_billing_summary" });
  logger.info("tool_registered", { name: "comms_set_billing_config" });
}
