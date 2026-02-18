/**
 * Data retention — configurable auto-purge of old records.
 * Runs as a daily cleanup job.
 * Each table has its own retention period (in days).
 */

import { logger } from "./logger.js";
import type { IDBProvider } from "../providers/interfaces.js";

export interface RetentionConfig {
  /** Days to keep message metadata (default: 90) */
  messagesRetentionDays: number;
  /** Days to keep usage logs (default: 365) */
  usageLogsRetentionDays: number;
  /** Days to keep call logs (default: 365) */
  callLogsRetentionDays: number;
  /** Days to keep voicemail messages (default: 30) */
  voicemailRetentionDays: number;
  /** Days to keep OTP codes (default: 1) */
  otpRetentionDays: number;
  /** Days to keep revoked consent records (default: 730 / 2 years) */
  revokedConsentRetentionDays: number;
  /** Whether data retention cleanup is enabled */
  enabled: boolean;
}

const DEFAULT_RETENTION: RetentionConfig = {
  messagesRetentionDays: 90,
  usageLogsRetentionDays: 365,
  callLogsRetentionDays: 365,
  voicemailRetentionDays: 30,
  otpRetentionDays: 1,
  revokedConsentRetentionDays: 730,
  enabled: true,
};

/**
 * Load retention config from environment variables.
 */
export function loadRetentionConfig(): RetentionConfig {
  return {
    messagesRetentionDays: parseInt(process.env.RETENTION_MESSAGES_DAYS || "") || DEFAULT_RETENTION.messagesRetentionDays,
    usageLogsRetentionDays: parseInt(process.env.RETENTION_USAGE_LOGS_DAYS || "") || DEFAULT_RETENTION.usageLogsRetentionDays,
    callLogsRetentionDays: parseInt(process.env.RETENTION_CALL_LOGS_DAYS || "") || DEFAULT_RETENTION.callLogsRetentionDays,
    voicemailRetentionDays: parseInt(process.env.RETENTION_VOICEMAIL_DAYS || "") || DEFAULT_RETENTION.voicemailRetentionDays,
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
    { name: "messages", table: "messages", column: "created_at", days: cfg.messagesRetentionDays },
    { name: "usage_logs", table: "usage_logs", column: "created_at", days: cfg.usageLogsRetentionDays },
    { name: "call_logs", table: "call_logs", column: "created_at", days: cfg.callLogsRetentionDays },
    { name: "voicemail_messages", table: "voicemail_messages", column: "created_at", days: cfg.voicemailRetentionDays },
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
