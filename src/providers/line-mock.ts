/**
 * Mock LINE adapter — returns fake results for development and demo mode.
 */

import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import type {
  ILineProvider,
  SendLineParams,
  SendLineResult,
} from "./interfaces.js";

function generateLineId(): string {
  return `LN${randomUUID().replace(/-/g, "")}`;
}

export function createMockLineProvider(): ILineProvider {
  return {
    async send(params: SendLineParams): Promise<SendLineResult> {
      const messageId = generateLineId();

      logger.info("mock_line_sent", {
        messageId,
        to: params.to,
        bodyLength: params.body.length,
        sandbox: true,
      });

      return {
        messageId,
        status: "sent",
        cost: 0.003,
      };
    },

    async getProfile(_channelAccessToken: string, userId: string): Promise<{ displayName: string; userId: string }> {
      logger.info("mock_line_get_profile", { userId });
      return {
        displayName: `Mock User (${userId})`,
        userId,
      };
    },
  };
}
