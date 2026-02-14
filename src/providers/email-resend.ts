/**
 * Resend email adapter — sends emails and verifies domains via the Resend REST API.
 * No SDK required — uses native fetch.
 */

import { logger } from "../lib/logger.js";
import type {
  IEmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "./interfaces.js";

const RESEND_API_BASE = "https://api.resend.com";

export function createResendEmailProvider(opts: {
  apiKey: string;
}): IEmailProvider {
  const { apiKey } = opts;

  async function resendFetch(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resp = await fetch(`${RESEND_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      const errMsg = (data as { message?: string }).message || JSON.stringify(data);
      throw new Error(`Resend API error (${resp.status}): ${errMsg}`);
    }

    return data;
  }

  return {
    async send(params: SendEmailParams): Promise<SendEmailResult> {
      const payload: Record<string, unknown> = {
        from: params.from,
        to: [params.to],
        subject: params.subject,
      };

      if (params.html) {
        payload.html = params.html;
      } else {
        payload.text = params.body;
      }

      if (params.replyTo) {
        payload.reply_to = [params.replyTo];
      }

      if (params.attachments && params.attachments.length > 0) {
        payload.attachments = params.attachments.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
          content_type: a.contentType,
        }));
      }

      const data = await resendFetch("/emails", payload);

      logger.info("resend_email_sent", {
        id: data.id,
        from: params.from,
        to: params.to,
        subject: params.subject,
      });

      return {
        messageId: data.id as string,
        status: "sent",
      };
    },

    async verifyDomain(domain: string): Promise<{ records: Array<{ type: string; name: string; value: string }> }> {
      const data = await resendFetch("/domains", { name: domain });

      logger.info("resend_domain_created", { domain, id: data.id });

      const rawRecords = (data.records || []) as Array<{ type: string; name: string; value: string }>;

      return {
        records: rawRecords.map((r) => ({
          type: r.type,
          name: r.name,
          value: r.value,
        })),
      };
    },
  };
}
