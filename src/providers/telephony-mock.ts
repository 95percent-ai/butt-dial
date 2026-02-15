/**
 * Mock telephony adapter — returns fake results for development and demo mode.
 * Only sendSms() is implemented; other methods throw "not implemented".
 */

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

function generateMockId(): string {
  counter++;
  return `mock-msg-${Date.now()}-${counter}`;
}

export function createMockTelephonyProvider(): ITelephonyProvider {
  return {
    async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
      const messageId = generateMockId();

      logger.info("mock_sms_sent", {
        messageId,
        from: params.from,
        to: params.to,
        bodyLength: params.body.length,
        mediaUrl: params.mediaUrl || null,
      });

      return {
        messageId,
        status: "sent",
        cost: 0.0075,
      };
    },

    async makeCall(params: MakeCallParams): Promise<MakeCallResult> {
      const callSid = `mock-call-${Date.now()}-${++counter}`;

      logger.info("mock_call_made", {
        callSid,
        from: params.from,
        to: params.to,
        hasTwiml: !!params.twiml,
        webhookUrl: params.webhookUrl ?? null,
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

    async buyNumber(params: BuyNumberParams): Promise<BuyNumberResult> {
      const areaCode = params.areaCode || "200";
      const phoneNumber = `+1555${areaCode}${String(++counter).padStart(4, "0")}`;
      const sid = `PN${Date.now()}${counter}`;

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
      _body: string,
      _url: string
    ): boolean {
      return true;
    },
  };
}
