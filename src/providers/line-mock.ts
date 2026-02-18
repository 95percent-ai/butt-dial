/**
 * Mock LINE adapter — returns fake results for development and demo mode.
 */

import { logger } from "../lib/logger.js";
import type {
  ILineProvider,
  SendLineParams,
  SendLineResult,
} from "./interfaces.js";

let counter = 0;

function generateMockId(): string {
  counter++;
  return `mock-line-${Date.now()}-${counter}`;
}

export function createMockLineProvider(): ILineProvider {
  return {
    async send(params: SendLineParams): Promise<SendLineResult> {
      const messageId = generateMockId();

      logger.info("mock_line_sent", {
        messageId,
        to: params.to,
        bodyLength: params.body.length,
      });

      return {
        messageId,
        status: "sent",
        cost: 0,
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
