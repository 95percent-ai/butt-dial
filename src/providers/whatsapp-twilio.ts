/**
 * Twilio WhatsApp adapter — sends WhatsApp messages via the same Twilio Messages API.
 * The only difference from SMS is the `whatsapp:` prefix on From/To numbers.
 */

import { logger } from "../lib/logger.js";
import type {
  IWhatsAppProvider,
  SendWhatsAppParams,
  SendWhatsAppResult,
} from "./interfaces.js";

interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

interface TwilioMessageResponse {
  sid: string;
  status: string;
  price: string | null;
  error_code: number | null;
  error_message: string | null;
  code?: number;
  message?: string;
}

export function createTwilioWhatsAppProvider(cfg: TwilioConfig): IWhatsAppProvider {
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}`;
  const authHeader = "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");

  return {
    async send(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
      const body = new URLSearchParams({
        From: `whatsapp:${params.from}`,
        To: `whatsapp:${params.to}`,
        Body: params.body,
      });

      if (params.mediaUrl) {
        body.set("MediaUrl", params.mediaUrl);
      }

      if (params.templateId) {
        body.set("ContentSid", params.templateId);
        if (params.templateVars) {
          body.set("ContentVariables", JSON.stringify(params.templateVars));
        }
      }

      const response = await fetch(`${baseUrl}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const rawBody = await response.text();
      let data: TwilioMessageResponse;
      try {
        data = JSON.parse(rawBody) as TwilioMessageResponse;
      } catch {
        logger.error("twilio_whatsapp_parse_error", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`Twilio WhatsApp failed: unexpected response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        const errorCode = data.error_code ?? data.code;
        const errorMessage = data.error_message ?? data.message;
        logger.error("twilio_whatsapp_failed", {
          status: response.status,
          errorCode,
          errorMessage,
        });
        throw new Error(`Twilio WhatsApp failed (${errorCode}): ${errorMessage || response.statusText}`);
      }

      logger.info("twilio_whatsapp_sent", {
        messageSid: data.sid,
        status: data.status,
        from: params.from,
        to: params.to,
        hasTemplate: !!params.templateId,
      });

      return {
        messageId: data.sid,
        status: data.status,
        cost: data.price ? Math.abs(parseFloat(data.price)) : undefined,
      };
    },

    async registerSender(phoneNumber: string, _displayName: string): Promise<{ senderId: string; status: string }> {
      // Stub — real WhatsApp sender registration is a manual Twilio/Meta process.
      // Phase 8 provisioning will flesh this out.
      logger.info("twilio_whatsapp_register_stub", { phoneNumber });
      return { senderId: phoneNumber, status: "pending" };
    },
  };
}
