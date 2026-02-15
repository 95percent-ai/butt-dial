/**
 * Alert manager — routes alerts by severity.
 * CRITICAL/HIGH: WhatsApp to admin + log + audit + metrics
 * MEDIUM: log (warn) + audit + metrics
 * LOW: log (info) + metrics
 */

import { logger } from "../lib/logger.js";
import { metrics } from "./metrics.js";
import { appendAuditLog } from "./audit-log.js";
import { sendAdminWhatsAppAlert, type AlertPayload } from "./whatsapp-alerter.js";

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

export interface Alert {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  message: string;
  actor?: string;
  target?: string;
  details?: Record<string, unknown>;
}

let _db: DBProvider | null = null;

/** Initialize the alert manager with a DB reference (call once at startup). */
export function initAlertManager(db: DBProvider): void {
  _db = db;
}

/** Send an alert — routes by severity. Never throws. */
export async function sendAlert(alert: Alert): Promise<void> {
  try {
    // Always increment metrics
    metrics.increment("mcp_alerts_total", { severity: alert.severity });

    // Log based on severity
    if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
      logger.error("alert_fired", {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        actor: alert.actor,
        target: alert.target,
      });
    } else if (alert.severity === "MEDIUM") {
      logger.warn("alert_fired", {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
      });
    } else {
      logger.info("alert_fired", {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
      });
    }

    // Audit log for CRITICAL/HIGH/MEDIUM
    if (_db && (alert.severity === "CRITICAL" || alert.severity === "HIGH" || alert.severity === "MEDIUM")) {
      try {
        appendAuditLog(_db, {
          eventType: `alert_${alert.severity.toLowerCase()}`,
          actor: alert.actor ?? "system",
          target: alert.target,
          details: { title: alert.title, message: alert.message, ...alert.details },
        });
      } catch (err) {
        logger.error("alert_audit_log_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // WhatsApp for CRITICAL/HIGH
    if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
      const payload: AlertPayload = {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
      };
      await sendAdminWhatsAppAlert(payload);
    }
  } catch (err) {
    // Alert manager must never break the main flow
    logger.error("alert_manager_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
