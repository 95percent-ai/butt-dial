/**
 * Vonage telephony adapter — alternative to Twilio.
 * Uses Vonage REST API v2 (Messages API) for SMS and Voice API for calls.
 */

import { createHmac } from "crypto";
import { logger } from "../lib/logger.js";
import type {
  ITelephonyProvider,
  SendSmsParams,
  SendSmsResult,
  MakeCallParams,
  MakeCallResult,
  TransferCallParams,
  BuyNumberParams,
  BuyNumberResult,
} from "./interfaces.js";

interface VonageConfig {
  apiKey: string;
  apiSecret: string;
  applicationId?: string;
  privateKey?: string;
}

export function createVonageTelephonyProvider(cfg: VonageConfig): ITelephonyProvider {
  const authHeader = "Basic " + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64");

  return {
    async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
      const response = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          api_secret: cfg.apiSecret,
          from: params.from,
          to: params.to.replace("+", ""),
          text: params.body,
        }),
      });

      const data = (await response.json()) as {
        messages: Array<{
          "message-id"?: string;
          status?: string;
          "message-price"?: string;
          "error-text"?: string;
        }>;
      };

      const msg = data.messages?.[0];
      if (!msg || msg.status !== "0") {
        throw new Error(`Vonage SMS failed: ${msg?.["error-text"] || "Unknown error"}`);
      }

      logger.info("vonage_sms_sent", { messageId: msg["message-id"], to: params.to });
      return {
        messageId: msg["message-id"] || "",
        status: "sent",
        cost: msg["message-price"] ? parseFloat(msg["message-price"]) : undefined,
      };
    },

    async makeCall(params: MakeCallParams): Promise<MakeCallResult> {
      const body: Record<string, unknown> = {
        to: [{ type: "phone", number: params.to.replace("+", "") }],
        from: { type: "phone", number: params.from.replace("+", "") },
      };

      if (params.webhookUrl) {
        body.answer_url = [params.webhookUrl];
      } else if (params.twiml) {
        // Vonage uses NCCO, not TwiML — convert basic say
        body.ncco = [{ action: "talk", text: "Call connected" }];
      }

      const response = await fetch("https://api.nexmo.com/v1/calls", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Vonage call failed (HTTP ${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = (await response.json()) as { uuid?: string; status?: string };
      logger.info("vonage_call_created", { uuid: data.uuid, to: params.to });

      return { callSid: data.uuid || "", status: data.status || "started" };
    },

    async transferCall(params: TransferCallParams): Promise<{ status: string }> {
      const response = await fetch(`https://api.nexmo.com/v1/calls/${params.callSid}`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "transfer",
          destination: {
            type: "ncco",
            ncco: [
              ...(params.announcementText ? [{ action: "talk", text: params.announcementText }] : []),
              { action: "connect", endpoint: [{ type: "phone", number: params.to.replace("+", "") }] },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Vonage transfer failed (HTTP ${response.status}): ${errText.slice(0, 200)}`);
      }

      logger.info("vonage_call_transferred", { callSid: params.callSid, to: params.to });
      return { status: "transferred" };
    },

    async buyNumber(params: BuyNumberParams): Promise<BuyNumberResult> {
      // Search for available numbers
      const searchResp = await fetch(
        `https://rest.nexmo.com/number/search?api_key=${cfg.apiKey}&api_secret=${cfg.apiSecret}&country=${params.country}&features=SMS,VOICE`,
        { method: "GET" }
      );

      if (!searchResp.ok) {
        throw new Error(`Vonage number search failed (HTTP ${searchResp.status})`);
      }

      const searchData = (await searchResp.json()) as {
        numbers?: Array<{ msisdn: string }>;
      };

      if (!searchData.numbers?.length) {
        throw new Error(`No Vonage numbers available for ${params.country}`);
      }

      const chosen = searchData.numbers[0];

      // Buy the number
      const buyResp = await fetch("https://rest.nexmo.com/number/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          api_secret: cfg.apiSecret,
          country: params.country,
          msisdn: chosen.msisdn,
        }),
      });

      if (!buyResp.ok) {
        throw new Error(`Vonage number purchase failed (HTTP ${buyResp.status})`);
      }

      logger.info("vonage_number_bought", { msisdn: chosen.msisdn });
      return { phoneNumber: `+${chosen.msisdn}`, sid: chosen.msisdn };
    },

    async releaseNumber(phoneNumber: string): Promise<void> {
      const msisdn = phoneNumber.replace("+", "");
      const resp = await fetch("https://rest.nexmo.com/number/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          api_secret: cfg.apiSecret,
          country: "US",
          msisdn,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Vonage number release failed (HTTP ${resp.status})`);
      }

      logger.info("vonage_number_released", { phoneNumber });
    },

    async configureWebhooks(
      phoneNumber: string,
      webhooks: { voiceUrl?: string; smsUrl?: string }
    ): Promise<void> {
      const msisdn = phoneNumber.replace("+", "");
      const body: Record<string, string> = {
        api_key: cfg.apiKey,
        api_secret: cfg.apiSecret,
        country: "US",
        msisdn,
      };
      if (webhooks.voiceUrl) body.voiceCallbackValue = webhooks.voiceUrl;
      if (webhooks.smsUrl) body.moHttpUrl = webhooks.smsUrl;

      const resp = await fetch("https://rest.nexmo.com/number/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`Vonage webhook config failed (HTTP ${resp.status})`);
      }

      logger.info("vonage_webhooks_configured", { phoneNumber, webhooks });
    },

    verifyWebhookSignature(
      headers: Record<string, string>,
      body: string,
      _url: string
    ): boolean {
      // Vonage uses HMAC-SHA256 with the signing secret
      const signature = headers["x-vonage-signature"];
      if (!signature || !cfg.apiSecret) return false;

      const expected = createHmac("sha256", cfg.apiSecret)
        .update(body)
        .digest("hex");

      return signature === expected;
    },
  };
}
