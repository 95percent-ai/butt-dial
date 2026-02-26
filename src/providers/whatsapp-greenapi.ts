/**
 * GreenAPI WhatsApp adapter — sends WhatsApp messages via green-api.com REST API.
 * Each GreenAPI instance corresponds to one phone number.
 */

import { logger } from "../lib/logger.js";
import type {
  IWhatsAppProvider,
  SendWhatsAppParams,
  SendWhatsAppResult,
} from "./interfaces.js";

interface GreenApiConfig {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

interface GreenApiSendResponse {
  idMessage?: string;
}

/**
 * Convert an E.164 phone number to GreenAPI chatId format.
 * Strips the leading "+" and appends "@c.us".
 */
function toChatId(phone: string): string {
  return phone.replace(/^\+/, "") + "@c.us";
}

export function createGreenapiWhatsAppProvider(cfg: GreenApiConfig): IWhatsAppProvider {
  const base = `https://${cfg.apiUrl}/waInstance${cfg.idInstance}`;

  return {
    async send(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
      const url = `${base}/sendMessage/${cfg.apiTokenInstance}`;
      const body = JSON.stringify({
        chatId: toChatId(params.to),
        message: params.body,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const rawBody = await response.text();
      let data: GreenApiSendResponse;
      try {
        data = JSON.parse(rawBody) as GreenApiSendResponse;
      } catch {
        logger.error("greenapi_whatsapp_parse_error", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`GreenAPI WhatsApp failed: unexpected response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        logger.error("greenapi_whatsapp_failed", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`GreenAPI WhatsApp failed (HTTP ${response.status}): ${rawBody.slice(0, 200)}`);
      }

      const messageId = data.idMessage ?? "unknown";

      logger.info("greenapi_whatsapp_sent", {
        messageId,
        from: params.from,
        to: params.to,
      });

      return {
        messageId,
        status: "sent",
        cost: undefined,
      };
    },

    async registerSender(phoneNumber: string, _displayName: string): Promise<{ senderId: string; status: string }> {
      // Stub — GreenAPI instances are registered through their dashboard.
      logger.info("greenapi_whatsapp_register_stub", { phoneNumber });
      return { senderId: phoneNumber, status: "pending" };
    },
  };
}
