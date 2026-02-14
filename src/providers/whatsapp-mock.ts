/**
 * Mock WhatsApp adapter — returns fake results for development and demo mode.
 */

import { logger } from "../lib/logger.js";
import type {
  IWhatsAppProvider,
  SendWhatsAppParams,
  SendWhatsAppResult,
} from "./interfaces.js";

let counter = 0;

function generateMockId(): string {
  counter++;
  return `mock-whatsapp-${Date.now()}-${counter}`;
}

export function createMockWhatsAppProvider(): IWhatsAppProvider {
  return {
    async send(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
      const messageId = generateMockId();

      logger.info("mock_whatsapp_sent", {
        messageId,
        from: params.from,
        to: params.to,
        bodyLength: params.body.length,
        hasMedia: !!params.mediaUrl,
        hasTemplate: !!params.templateId,
        templateVars: params.templateVars ? Object.keys(params.templateVars).length : 0,
      });

      return {
        messageId,
        status: "sent",
        cost: 0,
      };
    },

    async registerSender(phoneNumber: string, displayName: string): Promise<{ senderId: string; status: string }> {
      logger.info("mock_whatsapp_register", { phoneNumber, displayName });
      return { senderId: `mock-sender-${phoneNumber}`, status: "pending" };
    },
  };
}
