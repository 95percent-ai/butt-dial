/**
 * Billing module — markup computation, tier management, spending alerts.
 *
 * Markup is applied to provider costs to produce the billed cost.
 * Tiers define preset limits (free, starter, pro, enterprise).
 */

import { randomUUID } from "crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { sendAlert } from "../observability/alert-manager.js";

// ── Types ──────────────────────────────────────────────────────────

export interface BillingConfig {
  agentId: string;
  tier: string;
  markupPercent: number;
  billingEmail?: string;
}

export interface TierLimits {
  maxActionsPerMinute: number;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  maxSpendPerDay: number;
  maxSpendPerMonth: number;
}

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

interface BillingConfigRow {
  agent_id: string;
  tier: string;
  markup_percent: number;
  billing_email: string | null;
}

// ── Tier Definitions ───────────────────────────────────────────────

const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    maxActionsPerMinute: 5,
    maxActionsPerHour: 30,
    maxActionsPerDay: 100,
    maxSpendPerDay: 1,
    maxSpendPerMonth: 10,
  },
  starter: {
    maxActionsPerMinute: 10,
    maxActionsPerHour: 100,
    maxActionsPerDay: 500,
    maxSpendPerDay: 10,
    maxSpendPerMonth: 100,
  },
  pro: {
    maxActionsPerMinute: 30,
    maxActionsPerHour: 500,
    maxActionsPerDay: 5000,
    maxSpendPerDay: 100,
    maxSpendPerMonth: 1000,
  },
  enterprise: {
    maxActionsPerMinute: 100,
    maxActionsPerHour: 2000,
    maxActionsPerDay: 50000,
    maxSpendPerDay: 1000,
    maxSpendPerMonth: 50000,
  },
};

export function getTierLimits(tier: string): TierLimits {
  return TIER_LIMITS[tier] || TIER_LIMITS.starter;
}

export function getAvailableTiers(): string[] {
  return Object.keys(TIER_LIMITS);
}

// ── Markup Computation ─────────────────────────────────────────────

/**
 * Compute billed cost = providerCost * (1 + markup/100).
 * Uses per-agent markup if set, otherwise global default.
 */
export function computeBillingCost(providerCost: number, markupPercent: number): number {
  if (providerCost <= 0) return 0;
  const billed = providerCost * (1 + markupPercent / 100);
  return Math.round(billed * 10000) / 10000; // 4 decimal places
}

// ── Per-Agent Billing Config ───────────────────────────────────────

export function getAgentBillingConfig(db: DBProvider, agentId: string): BillingConfig {
  try {
    const rows = db.query<BillingConfigRow>(
      "SELECT agent_id, tier, markup_percent, billing_email FROM billing_config WHERE agent_id = ?",
      [agentId]
    );

    if (rows.length > 0) {
      const r = rows[0];
      return {
        agentId: r.agent_id,
        tier: r.tier,
        markupPercent: r.markup_percent || config.billingMarkupPercent,
        billingEmail: r.billing_email || undefined,
      };
    }
  } catch {
    // Table might not exist yet
  }

  // Default
  return {
    agentId,
    tier: "starter",
    markupPercent: config.billingMarkupPercent,
  };
}

export function setAgentBillingConfig(
  db: DBProvider,
  agentId: string,
  updates: { tier?: string; markupPercent?: number; billingEmail?: string },
): void {
  const existing = db.query<{ id: string }>(
    "SELECT id FROM billing_config WHERE agent_id = ?",
    [agentId]
  );

  if (existing.length === 0) {
    db.run(
      `INSERT INTO billing_config (id, agent_id, tier, markup_percent, billing_email)
       VALUES (?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        agentId,
        updates.tier || "starter",
        updates.markupPercent ?? config.billingMarkupPercent,
        updates.billingEmail || null,
      ]
    );
  } else {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.tier !== undefined) {
      sets.push("tier = ?");
      params.push(updates.tier);
    }
    if (updates.markupPercent !== undefined) {
      sets.push("markup_percent = ?");
      params.push(updates.markupPercent);
    }
    if (updates.billingEmail !== undefined) {
      sets.push("billing_email = ?");
      params.push(updates.billingEmail);
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(agentId);
      db.run(
        `UPDATE billing_config SET ${sets.join(", ")} WHERE agent_id = ?`,
        params
      );
    }
  }

  logger.info("billing_config_updated", { agentId, ...updates });
}

// ── Spending Alerts ────────────────────────────────────────────────

interface SpendingSummary {
  daySpend: number;
  monthSpend: number;
  dayLimit: number;
  monthLimit: number;
}

/**
 * Check if spending is approaching limits and fire alerts.
 * Called after each usage log. Alerts at 80% threshold.
 */
export function checkSpendingAlerts(agentId: string, summary: SpendingSummary): void {
  const dayRatio = summary.dayLimit > 0 ? summary.daySpend / summary.dayLimit : 0;
  const monthRatio = summary.monthLimit > 0 ? summary.monthSpend / summary.monthLimit : 0;

  if (dayRatio >= 0.8 && dayRatio < 1) {
    sendAlert({
      severity: "MEDIUM",
      title: "Daily spending approaching limit",
      message: `Agent ${agentId}: $${summary.daySpend.toFixed(2)} of $${summary.dayLimit.toFixed(2)} daily limit (${Math.round(dayRatio * 100)}%)`,
      actor: agentId,
      details: { daySpend: summary.daySpend, dayLimit: summary.dayLimit },
    }).catch(() => {});
    logger.warn("spending_alert_daily", { agentId, daySpend: summary.daySpend, dayLimit: summary.dayLimit });
  }

  if (monthRatio >= 0.8 && monthRatio < 1) {
    sendAlert({
      severity: "MEDIUM",
      title: "Monthly spending approaching limit",
      message: `Agent ${agentId}: $${summary.monthSpend.toFixed(2)} of $${summary.monthLimit.toFixed(2)} monthly limit (${Math.round(monthRatio * 100)}%)`,
      actor: agentId,
      details: { monthSpend: summary.monthSpend, monthLimit: summary.monthLimit },
    }).catch(() => {});
    logger.warn("spending_alert_monthly", { agentId, monthSpend: summary.monthSpend, monthLimit: summary.monthLimit });
  }
}

// ── Billing Summary Query ──────────────────────────────────────────

interface CostRow { channel: string; provider_cost: number; action_count: number }

export function getBillingSummary(
  db: DBProvider,
  agentId: string,
  timeFilter: string,
  orgId?: string,
): {
  providerCost: number;
  billingCost: number;
  markupPercent: number;
  byChannel: Record<string, { providerCost: number; billingCost: number; count: number }>;
  tier: string;
} {
  const billingConfig = getAgentBillingConfig(db, agentId);
  const markup = billingConfig.markupPercent;

  const orgClause = orgId ? " AND org_id = ?" : "";
  const orgParams = orgId ? [orgId] : [];

  const rows = db.query<CostRow>(
    `SELECT channel, COALESCE(SUM(cost), 0) as provider_cost, COUNT(*) as action_count
     FROM usage_logs WHERE agent_id = ? AND ${timeFilter}${orgClause} GROUP BY channel`,
    [agentId, ...orgParams]
  );

  let totalProviderCost = 0;
  const byChannel: Record<string, { providerCost: number; billingCost: number; count: number }> = {};

  for (const row of rows) {
    const pc = Math.round(row.provider_cost * 10000) / 10000;
    const bc = computeBillingCost(row.provider_cost, markup);
    totalProviderCost += row.provider_cost;
    byChannel[row.channel] = { providerCost: pc, billingCost: bc, count: row.action_count };
  }

  return {
    providerCost: Math.round(totalProviderCost * 10000) / 10000,
    billingCost: computeBillingCost(totalProviderCost, markup),
    markupPercent: markup,
    byChannel,
    tier: billingConfig.tier,
  };
}
