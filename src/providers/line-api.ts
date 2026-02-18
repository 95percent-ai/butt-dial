/**
 * LINE Messaging API adapter — sends messages via the LINE Push Message API.
 * Uses raw fetch() — no @line/bot-sdk dependency (matches project pattern).
 */

import { logger } from "../lib/logger.js";
import type {
  ILineProvider,
  SendLineParams,
  SendLineResult,
} from "./interfaces.js";

interface LineConfig {
  channelAccessToken: string;
}

interface LinePushResponse {
  sentMessages?: Array<{ id: string; quoteToken?: string }>;
  message?: string;
}

interface LineProfileResponse {
  displayName: string;
  userId: string;
  pictureUrl?: string;
  statusMessage?: string;
  message?: string;
}

export function createLineProvider(cfg: LineConfig): ILineProvider {
  const baseUrl = "https://api.line.me/v2/bot";

  function authHeader(token?: string): string {
    return `Bearer ${token || cfg.channelAccessToken}`;
  }

  return {
    async send(params: SendLineParams): Promise<SendLineResult> {
      const token = params.channelAccessToken || cfg.channelAccessToken;

      const response = await fetch(`${baseUrl}/message/push`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: params.to,
          messages: [
            {
              type: "text",
              text: params.body,
            },
          ],
        }),
      });

      const rawBody = await response.text();
      let data: LinePushResponse;
      try {
        data = rawBody ? (JSON.parse(rawBody) as LinePushResponse) : {};
      } catch {
        logger.error("line_api_parse_error", { status: response.status, body: rawBody.slice(0, 500) });
        throw new Error(`LINE API failed: unexpected response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        logger.error("line_api_failed", {
          status: response.status,
          message: data.message,
        });
        throw new Error(`LINE API failed (${response.status}): ${data.message || response.statusText}`);
      }

      const messageId = data.sentMessages?.[0]?.id || `line-${Date.now()}`;

      logger.info("line_message_sent", {
        messageId,
        to: params.to,
        bodyLength: params.body.length,
      });

      return {
        messageId,
        status: "sent",
        cost: 0, // LINE push messages are free
      };
    },

    async getProfile(channelAccessToken: string, userId: string): Promise<{ displayName: string; userId: string }> {
      const response = await fetch(`${baseUrl}/profile/${userId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`LINE getProfile failed (${response.status}): ${response.statusText}`);
      }

      const data = (await response.json()) as LineProfileResponse;

      return {
        displayName: data.displayName,
        userId: data.userId,
      };
    },
  };
}
