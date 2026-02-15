/**
 * Rate limiter — checks per-minute, per-hour, per-day action counts,
 * daily/monthly spending caps, and contact frequency before each action.
 * Logs every action after success for future rate checking.
 */

import { randomUUID } from "crypto";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { AuthInfo } from "./auth-guard.js";

// ── Types ──────────────────────────────────────────────────────────

export interface AgentLimits {
  maxActionsPerMinute: number;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  maxSpendPerDay: number;
  maxSpendPerMonth: number;
  maxCallsPerDaySameNumber: number;
}

export class RateLimitError extends Error {
  limitType: string;
  current: number;
  max: number;
  resetDescription: string;

  constructor(limitType: string, current: number, max: number, resetDescription: string) {
    super(`Rate limit exceeded: ${limitType} (${current}/${max}). Resets ${resetDescription}.`);
    this.name = "RateLimitError";
    this.limitType = limitType;
    this.current = current;
    this.max = max;
    this.resetDescription = resetDescription;
  }
}

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

interface CountRow { cnt: number }
interface SumRow { total: number | null }

// ── Get agent limits ───────────────────────────────────────────────

interface SpendingLimitsRow {
  max_actions_per_minute: number;
  max_actions_per_hour: number;
  max_actions_per_day: number;
  max_spend_per_day: number;
  max_spend_per_month: number;
}

export function getAgentLimits(db: DBProvider, agentId: string): AgentLimits {
  const rows = db.query<SpendingLimitsRow>(
    "SELECT max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month FROM spending_limits WHERE agent_id = ?",
    [agentId]
  );

  if (rows.length > 0) {
    const r = rows[0];
    return {
      maxActionsPerMinute: r.max_actions_per_minute,
      maxActionsPerHour: r.max_actions_per_hour,
      maxActionsPerDay: r.max_actions_per_day,
      maxSpendPerDay: r.max_spend_per_day,
      maxSpendPerMonth: r.max_spend_per_month,
      maxCallsPerDaySameNumber: config.defaultMaxCallsPerDaySameNumber,
    };
  }

  // Fall back to config defaults
  return {
    maxActionsPerMinute: config.defaultMaxActionsPerMinute,
    maxActionsPerHour: config.defaultMaxActionsPerHour,
    maxActionsPerDay: config.defaultMaxActionsPerDay,
    maxSpendPerDay: config.defaultMaxSpendPerDay,
    maxSpendPerMonth: config.defaultMaxSpendPerMonth,
    maxCallsPerDaySameNumber: config.defaultMaxCallsPerDaySameNumber,
  };
}

// ── Check rate limits ──────────────────────────────────────────────

export function checkRateLimits(
  db: DBProvider,
  agentId: string,
  actionType: string,
  channel: string,
  targetAddress: string | null,
  authInfo?: AuthInfo,
): void {
  // Skip in demo mode
  if (config.demoMode) return;

  // Skip for admin (master token)
  if (authInfo?.scopes?.includes("admin")) return;

  const limits = getAgentLimits(db, agentId);

  // 1. Per-minute check
  const minuteCount = db.query<CountRow>(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND created_at >= datetime('now', '-1 minute')",
    [agentId]
  )[0]?.cnt ?? 0;

  if (minuteCount >= limits.maxActionsPerMinute) {
    throw new RateLimitError("per-minute", minuteCount, limits.maxActionsPerMinute, "in up to 60 seconds");
  }

  // 2. Per-hour check
  const hourCount = db.query<CountRow>(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND created_at >= datetime('now', '-1 hour')",
    [agentId]
  )[0]?.cnt ?? 0;

  if (hourCount >= limits.maxActionsPerHour) {
    throw new RateLimitError("per-hour", hourCount, limits.maxActionsPerHour, "in up to 60 minutes");
  }

  // 3. Per-day check (calendar day UTC)
  const dayCount = db.query<CountRow>(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')",
    [agentId]
  )[0]?.cnt ?? 0;

  if (dayCount >= limits.maxActionsPerDay) {
    throw new RateLimitError("per-day", dayCount, limits.maxActionsPerDay, "at midnight UTC");
  }

  // 4. Daily spending cap
  const daySpend = db.query<SumRow>(
    "SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')",
    [agentId]
  )[0]?.total ?? 0;

  if (daySpend >= limits.maxSpendPerDay) {
    throw new RateLimitError("daily-spend", daySpend, limits.maxSpendPerDay, "at midnight UTC");
  }

  // 5. Monthly spending cap (calendar month UTC)
  const monthSpend = db.query<SumRow>(
    "SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now', 'start of month')",
    [agentId]
  )[0]?.total ?? 0;

  if (monthSpend >= limits.maxSpendPerMonth) {
    throw new RateLimitError("monthly-spend", monthSpend, limits.maxSpendPerMonth, "at the start of next month");
  }

  // 6. Contact frequency (voice calls to same number, per day)
  if (targetAddress && (actionType === "voice_call" || actionType === "voice_message")) {
    const contactCount = db.query<CountRow>(
      "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND target_address = ? AND action_type IN ('voice_call', 'voice_message') AND created_at >= date('now')",
      [agentId, targetAddress]
    )[0]?.cnt ?? 0;

    if (contactCount >= limits.maxCallsPerDaySameNumber) {
      throw new RateLimitError(
        "contact-frequency",
        contactCount,
        limits.maxCallsPerDaySameNumber,
        "at midnight UTC"
      );
    }
  }
}

// ── Log usage ──────────────────────────────────────────────────────

export interface UsageLogEntry {
  agentId: string;
  actionType: string;
  channel: string;
  targetAddress?: string | null;
  cost?: number | null;
  externalId?: string | null;
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export function logUsage(db: DBProvider, entry: UsageLogEntry): string {
  const id = randomUUID();
  db.run(
    `INSERT INTO usage_logs (id, agent_id, action_type, channel, target_address, cost, external_id, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.agentId,
      entry.actionType,
      entry.channel,
      entry.targetAddress ?? null,
      entry.cost ?? 0,
      entry.externalId ?? null,
      entry.status ?? "success",
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );

  logger.info("usage_logged", { id, agentId: entry.agentId, actionType: entry.actionType, channel: entry.channel });
  return id;
}

// ── Update cost later (e.g. voice call cost from webhook) ──────────

export function updateUsageCost(db: DBProvider, externalId: string, cost: number): void {
  db.run(
    "UPDATE usage_logs SET cost = ? WHERE external_id = ?",
    [cost, externalId]
  );
  logger.info("usage_cost_updated", { externalId, cost });
}

// ── Error response helper ──────────────────────────────────────────

export function rateLimitErrorResponse(err: unknown) {
  if (err instanceof RateLimitError) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: err.message,
          limitType: err.limitType,
          current: err.current,
          max: err.max,
          resetDescription: err.resetDescription,
        }),
      }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded" }) }],
    isError: true,
  };
}
