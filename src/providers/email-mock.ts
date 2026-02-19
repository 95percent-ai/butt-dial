/**
 * Mock email adapter — returns fake results for development and demo mode.
 */

import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import type {
  IEmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "./interfaces.js";

function generateEmailId(): string {
  return `EM${randomUUID().replace(/-/g, "")}`;
}

export function createMockEmailProvider(): IEmailProvider {
  return {
    async send(params: SendEmailParams): Promise<SendEmailResult> {
      const messageId = generateEmailId();

      logger.info("mock_email_sent", {
        messageId,
        from: params.from,
        to: params.to,
        subject: params.subject,
        bodyLength: params.body.length,
        hasHtml: !!params.html,
        attachments: params.attachments?.length ?? 0,
        sandbox: true,
      });

      return {
        messageId,
        status: "sent",
        cost: 0.001,
      };
    },

    async verifyDomain(domain: string): Promise<{ records: Array<{ type: string; name: string; value: string }> }> {
      logger.info("mock_domain_verified", { domain });

      return {
        records: [
          { type: "TXT", name: `resend._domainkey.${domain}`, value: "mock-dkim-value" },
          { type: "TXT", name: domain, value: "v=spf1 include:resend.com ~all" },
          { type: "MX", name: domain, value: "feedback-smtp.resend.com" },
        ],
      };
    },
  };
}
