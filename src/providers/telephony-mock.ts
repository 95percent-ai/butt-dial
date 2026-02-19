/**
 * Mock telephony adapter — returns fake results for development and demo mode.
 * Only sendSms() is implemented; other methods throw "not implemented".
 */

import { randomUUID } from "crypto";
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

let counter = 0;

/** Generate realistic Twilio-format IDs */
function generateSmsId(): string {
  return `SM${randomUUID().replace(/-/g, "")}`;
}

function generateCallId(): string {
  return `CA${randomUUID().replace(/-/g, "")}`;
}

function generatePhoneSid(): string {
  return `PN${randomUUID().replace(/-/g, "")}`;
}

export function createMockTelephonyProvider(): ITelephonyProvider {
  return {
    async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
      const messageId = generateSmsId();

      logger.info("mock_sms_sent", {
        messageId,
        from: params.from,
        to: params.to,
        bodyLength: params.body.length,
        mediaUrl: params.mediaUrl || null,
        sandbox: true,
      });

      return {
        messageId,
        status: "sent",
        cost: 0.0079,
      };
    },

    async makeCall(params: MakeCallParams): Promise<MakeCallResult> {
      const callSid = generateCallId();

      logger.info("mock_call_made", {
        callSid,
        from: params.from,
        to: params.to,
        hasTwiml: !!params.twiml,
        webhookUrl: params.webhookUrl ?? null,
        sandbox: true,
      });

      return { callSid, status: "queued" };
    },

    async transferCall(params: TransferCallParams): Promise<{ status: string }> {
      logger.info("mock_call_transferred", {
        callSid: params.callSid,
        to: params.to,
        announcement: params.announcementText || null,
      });
      return { status: "transferred" };
    },

    async endCall(callSid: string): Promise<void> {
      logger.info("mock_call_ended", { callSid });
    },

    async buyNumber(params: BuyNumberParams): Promise<BuyNumberResult> {
      const areaCode = params.areaCode || "200";
      const phoneNumber = `+1555${areaCode}${String(++counter).padStart(4, "0")}`;
      const sid = generatePhoneSid();

      logger.info("mock_number_bought", {
        phoneNumber,
        sid,
        country: params.country,
        capabilities: params.capabilities,
      });

      return { phoneNumber, sid };
    },

    async releaseNumber(phoneNumber: string): Promise<void> {
      logger.info("mock_number_released", { phoneNumber });
    },

    async configureWebhooks(
      phoneNumber: string,
      webhooks: { voiceUrl?: string; smsUrl?: string }
    ): Promise<void> {
      logger.info("mock_webhooks_configured", {
        phoneNumber,
        smsUrl: webhooks.smsUrl ?? "(none)",
        voiceUrl: webhooks.voiceUrl ?? "(none)",
      });
    },

    verifyWebhookSignature(
      _headers: Record<string, string>,
      _body: string | Record<string, string>,
      _url: string
    ): boolean {
      return true;
    },
  };
}
