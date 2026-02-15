/**
 * Mock STT adapter — returns fake transcription for demo/dev mode.
 */

import { logger } from "../lib/logger.js";
import type { ISTTProvider } from "./interfaces.js";

export function createMockSTTProvider(): ISTTProvider {
  return {
    async transcribe(audioBuffer: Buffer, format?: string): Promise<{ text: string; confidence: number }> {
      logger.info("mock_stt_transcribe", {
        bufferSize: audioBuffer.length,
        format: format || "wav",
      });

      return {
        text: "This is a mock transcription of the audio content.",
        confidence: 0.95,
      };
    },
  };
}
