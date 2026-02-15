/**
 * WhatsApp alerter — sends formatted admin alerts via the WhatsApp provider.
 * Returns false on failure (never throws). Alerting must never break the main flow.
 */

import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

export interface AlertPayload {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  message: string;
  timestamp?: string;
}

function formatAlertMessage(alert: AlertPayload): string {
  const ts = alert.timestamp ?? new Date().toISOString();
  const icon =
    alert.severity === "CRITICAL" ? "[!!!]" :
    alert.severity === "HIGH" ? "[!!]" :
    alert.severity === "MEDIUM" ? "[!]" : "[i]";

  return `${icon} ${alert.severity}: ${alert.title}\n${alert.message}\nTime: ${ts}`;
}

/** Send an alert to the admin WhatsApp number. Returns true on success, false on failure. */
export async function sendAdminWhatsAppAlert(alert: AlertPayload): Promise<boolean> {
  try {
    const adminNumber = config.adminWhatsappNumber;
    const senderNumber = config.adminWhatsappSender;

    if (!adminNumber || !senderNumber) {
      logger.debug("whatsapp_alert_skipped", { reason: "admin number or sender not configured" });
      return false;
    }

    const whatsapp = getProvider("whatsapp");
    const body = formatAlertMessage(alert);

    await whatsapp.send({ from: senderNumber, to: adminNumber, body });

    logger.info("whatsapp_alert_sent", { severity: alert.severity, title: alert.title });
    return true;
  } catch (err) {
    logger.error("whatsapp_alert_failed", {
      severity: alert.severity,
      title: alert.title,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
