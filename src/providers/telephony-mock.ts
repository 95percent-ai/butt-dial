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

    async makeCall(_params: MakeCallParams): Promise<MakeCallResult> {
      throw new Error("makeCall is not implemented in mock adapter");
    },

    async buyNumber(_params: BuyNumberParams): Promise<BuyNumberResult> {
      throw new Error("buyNumber is not implemented in mock adapter");
    },

    async releaseNumber(_phoneNumber: string): Promise<void> {
      throw new Error("releaseNumber is not implemented in mock adapter");
    },

    async configureWebhooks(
      _phoneNumber: string,
      _webhooks: { voiceUrl?: string; smsUrl?: string }
    ): Promise<void> {
      throw new Error("configureWebhooks is not implemented in mock adapter");
    },

    verifyWebhookSignature(
      _headers: Record<string, string>,
      _body: string,
      _url: string
    ): boolean {
      throw new Error("verifyWebhookSignature is not implemented in mock adapter");
    },
  };
}
