/**
 * Twilio telephony adapter — calls Twilio REST API via fetch.
 * Only sendSms() is implemented for Phase 2; other methods throw "not implemented".
 */

import { logger } from "../lib/logger.js";
import type {
  ITelephonyProvider,
  SendSmsParams,
  SendSmsResult,
  MakeCallParams,
  MakeCallResult,
  BuyNumberParams,
  BuyNumberResult,
} from "./interfaces.js";

interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

interface TwilioMessageResponse {
  sid: string;
  status: string;
  price: string | null;
  // Success response fields
  error_code: number | null;
  error_message: string | null;
  // Error response fields (different format on HTTP 4xx)
  code?: number;
  message?: string;
}

export function createTwilioTelephonyProvider(cfg: TwilioConfig): ITelephonyProvider {
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}`;
  const authHeader = "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");

  return {
    async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
      const body = new URLSearchParams({
        From: params.from,
        To: params.to,
        Body: params.body,
      });
      if (params.mediaUrl) {
        body.set("MediaUrl", params.mediaUrl);
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
        logger.error("twilio_sms_parse_error", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`Twilio SMS failed: unexpected response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        const errorCode = data.error_code ?? data.code;
        const errorMessage = data.error_message ?? data.message;
        logger.error("twilio_sms_failed", {
          status: response.status,
          errorCode,
          errorMessage,
        });
        throw new Error(`Twilio SMS failed (${errorCode}): ${errorMessage || response.statusText}`);
      }

      logger.info("twilio_sms_sent", {
        messageSid: data.sid,
        status: data.status,
        from: params.from,
        to: params.to,
      });

      return {
        messageId: data.sid,
        status: data.status,
        cost: data.price ? Math.abs(parseFloat(data.price)) : undefined,
      };
    },

    async makeCall(params: MakeCallParams): Promise<MakeCallResult> {
      const body = new URLSearchParams({
        From: params.from,
        To: params.to,
      });

      if (params.twiml) {
        body.set("Twiml", params.twiml);
      } else if (params.webhookUrl) {
        body.set("Url", params.webhookUrl);
      } else {
        throw new Error("makeCall requires either twiml or webhookUrl");
      }

      if (params.statusCallbackUrl) {
        body.set("StatusCallback", params.statusCallbackUrl);
      }

      const response = await fetch(`${baseUrl}/Calls.json`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const rawBody = await response.text();
      let data: { sid?: string; status?: string; code?: number; message?: string };
      try {
        data = JSON.parse(rawBody);
      } catch {
        logger.error("twilio_call_parse_error", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`Twilio call failed: unexpected response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        logger.error("twilio_call_failed", {
          status: response.status,
          errorCode: data.code,
          errorMessage: data.message,
        });
        throw new Error(`Twilio call failed (${data.code}): ${data.message || response.statusText}`);
      }

      logger.info("twilio_call_created", {
        callSid: data.sid,
        status: data.status,
        from: params.from,
        to: params.to,
      });

      return {
        callSid: data.sid!,
        status: data.status ?? "queued",
      };
    },

    async buyNumber(params: BuyNumberParams): Promise<BuyNumberResult> {
      // Step 1: Search for available numbers
      const capFilters: string[] = [];
      if (params.capabilities.voice) capFilters.push("VoiceEnabled=true");
      if (params.capabilities.sms) capFilters.push("SmsEnabled=true");
      if (params.areaCode) capFilters.push(`AreaCode=${params.areaCode}`);

      const searchUrl = `${baseUrl}/AvailablePhoneNumbers/${params.country}/Local.json?${capFilters.join("&")}`;
      const searchResp = await fetch(searchUrl, {
        headers: { Authorization: authHeader },
      });

      if (!searchResp.ok) {
        const errText = await searchResp.text();
        throw new Error(`Twilio number search failed (HTTP ${searchResp.status}): ${errText}`);
      }

      const searchData = (await searchResp.json()) as {
        available_phone_numbers: Array<{ phone_number: string; friendly_name: string }>;
      };

      if (searchData.available_phone_numbers.length === 0) {
        throw new Error(`No available phone numbers found for country=${params.country}`);
      }

      const chosen = searchData.available_phone_numbers[0];

      // Step 2: Purchase the number
      const purchaseBody = new URLSearchParams({
        PhoneNumber: chosen.phone_number,
      });

      const purchaseResp = await fetch(`${baseUrl}/IncomingPhoneNumbers.json`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: purchaseBody.toString(),
      });

      if (!purchaseResp.ok) {
        const errText = await purchaseResp.text();
        throw new Error(`Twilio number purchase failed (HTTP ${purchaseResp.status}): ${errText}`);
      }

      const purchaseData = (await purchaseResp.json()) as {
        sid: string;
        phone_number: string;
      };

      logger.info("twilio_number_bought", {
        phoneNumber: purchaseData.phone_number,
        sid: purchaseData.sid,
        country: params.country,
      });

      return {
        phoneNumber: purchaseData.phone_number,
        sid: purchaseData.sid,
      };
    },

    async releaseNumber(phoneNumber: string): Promise<void> {
      // Step 1: Look up the phone number SID
      const lookupUrl = `${baseUrl}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
      const lookupResp = await fetch(lookupUrl, {
        headers: { Authorization: authHeader },
      });

      if (!lookupResp.ok) {
        throw new Error(`Twilio number lookup failed (HTTP ${lookupResp.status}): ${await lookupResp.text()}`);
      }

      const lookupData = (await lookupResp.json()) as {
        incoming_phone_numbers: Array<{ sid: string }>;
      };

      if (lookupData.incoming_phone_numbers.length === 0) {
        throw new Error(`Phone number ${phoneNumber} not found in Twilio account`);
      }

      const phoneSid = lookupData.incoming_phone_numbers[0].sid;

      // Step 2: Delete (release) the number
      const deleteResp = await fetch(`${baseUrl}/IncomingPhoneNumbers/${phoneSid}.json`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });

      if (!deleteResp.ok) {
        throw new Error(`Twilio number release failed (HTTP ${deleteResp.status}): ${await deleteResp.text()}`);
      }

      logger.info("twilio_number_released", { phoneNumber, phoneSid });
    },

    async configureWebhooks(
      phoneNumber: string,
      webhooks: { voiceUrl?: string; smsUrl?: string }
    ): Promise<void> {
      // Step 1: Look up the phone number SID
      const lookupUrl = `${baseUrl}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
      const lookupResp = await fetch(lookupUrl, {
        headers: { Authorization: authHeader },
      });

      if (!lookupResp.ok) {
        throw new Error(`Twilio lookup failed (HTTP ${lookupResp.status}): ${await lookupResp.text()}`);
      }

      const lookupData = (await lookupResp.json()) as {
        incoming_phone_numbers: Array<{ sid: string; phone_number: string }>;
      };

      if (lookupData.incoming_phone_numbers.length === 0) {
        throw new Error(`Phone number ${phoneNumber} not found in Twilio account`);
      }

      const phoneSid = lookupData.incoming_phone_numbers[0].sid;

      // Step 2: Update the webhook URLs
      const updateBody = new URLSearchParams();
      if (webhooks.smsUrl) updateBody.set("SmsUrl", webhooks.smsUrl);
      if (webhooks.voiceUrl) updateBody.set("VoiceUrl", webhooks.voiceUrl);

      const updateResp = await fetch(`${baseUrl}/IncomingPhoneNumbers/${phoneSid}.json`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: updateBody.toString(),
      });

      if (!updateResp.ok) {
        throw new Error(`Twilio webhook update failed (HTTP ${updateResp.status}): ${await updateResp.text()}`);
      }

      logger.info("twilio_webhooks_configured", {
        phoneNumber,
        phoneSid,
        smsUrl: webhooks.smsUrl ?? "(unchanged)",
        voiceUrl: webhooks.voiceUrl ?? "(unchanged)",
      });
    },

    verifyWebhookSignature(
      _headers: Record<string, string>,
      _body: string,
      _url: string
    ): boolean {
      throw new Error("verifyWebhookSignature is not implemented yet");
    },
  };
}
