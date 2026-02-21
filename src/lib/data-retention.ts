/**
 * Data retention — configurable auto-purge of old records.
 * Runs as a daily cleanup job.
 * Each table has its own retention period (in days).
 */

import { logger } from "./logger.js";
import type { IDBProvider } from "../providers/interfaces.js";

export interface RetentionConfig {
  /** Days to keep usage logs (default: 365) */
  usageLogsRetentionDays: number;
  /** Days to keep call logs (default: 365) */
  callLogsRetentionDays: number;
  /** Days to keep acknowledged dead letters (default: 7) */
  deadLetterRetentionDays: number;
  /** Days to keep OTP codes (default: 1) */
  otpRetentionDays: number;
  /** Days to keep revoked consent records (default: 730 / 2 years) */
  revokedConsentRetentionDays: number;
  /** Whether data retention cleanup is enabled */
  enabled: boolean;
}

const DEFAULT_RETENTION: RetentionConfig = {
  usageLogsRetentionDays: 365,
  callLogsRetentionDays: 365,
  deadLetterRetentionDays: 7,
  otpRetentionDays: 1,
  revokedConsentRetentionDays: 730,
  enabled: true,
};

/**
 * Load retention config from environment variables.
 */
export function loadRetentionConfig(): RetentionConfig {
  return {
    usageLogsRetentionDays: parseInt(process.env.RETENTION_USAGE_LOGS_DAYS || "") || DEFAULT_RETENTION.usageLogsRetentionDays,
    callLogsRetentionDays: parseInt(process.env.RETENTION_CALL_LOGS_DAYS || "") || DEFAULT_RETENTION.callLogsRetentionDays,
    deadLetterRetentionDays: parseInt(process.env.RETENTION_DEAD_LETTER_DAYS || "") || DEFAULT_RETENTION.deadLetterRetentionDays,
    otpRetentionDays: parseInt(process.env.RETENTION_OTP_DAYS || "") || DEFAULT_RETENTION.otpRetentionDays,
    revokedConsentRetentionDays: parseInt(process.env.RETENTION_REVOKED_CONSENT_DAYS || "") || DEFAULT_RETENTION.revokedConsentRetentionDays,
    enabled: process.env.DATA_RETENTION_ENABLED !== "false",
  };
}

/**
 * Run data retention cleanup.
 * Deletes records older than the configured retention period.
 * Returns summary of what was deleted.
 */
export function runDataRetentionCleanup(db: IDBProvider, config?: Partial<RetentionConfig>): {
  totalDeleted: number;
  details: Record<string, number>;
} {
  const cfg = { ...loadRetentionConfig(), ...config };

  if (!cfg.enabled) {
    return { totalDeleted: 0, details: {} };
  }

  const details: Record<string, number> = {};
  let totalDeleted = 0;

  const tables: Array<{
    name: string;
    table: string;
    column: string;
    days: number;
    extraCondition?: string;
  }> = [
    { name: "usage_logs", table: "usage_logs", column: "created_at", days: cfg.usageLogsRetentionDays },
    { name: "call_logs", table: "call_logs", column: "created_at", days: cfg.callLogsRetentionDays },
    { name: "dead_letters_acknowledged", table: "dead_letters", column: "acknowledged_at", days: cfg.deadLetterRetentionDays, extraCondition: "AND status = 'acknowledged'" },
    { name: "otp_codes", table: "otp_codes", column: "created_at", days: cfg.otpRetentionDays },
    {
      name: "revoked_consent",
      table: "contact_consent",
      column: "revoked_at",
      days: cfg.revokedConsentRetentionDays,
      extraCondition: "AND status = 'revoked'",
    },
  ];

  for (const { name, table, column, days, extraCondition } of tables) {
    try {
      const condition = extraCondition || "";
      const result = db.run(
        `DELETE FROM ${table} WHERE ${column} < datetime('now', '-${days} days') ${condition}`,
        []
      );
      if (result.changes > 0) {
        details[name] = result.changes;
        totalDeleted += result.changes;
      }
    } catch {
      // Table might not exist — skip silently
    }
  }

  if (totalDeleted > 0) {
    logger.info("data_retention_cleanup", { totalDeleted, details });
  }

  return { totalDeleted, details };
}
