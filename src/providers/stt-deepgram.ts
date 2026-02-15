/**
 * Deepgram STT adapter — transcribes audio via Deepgram's HTTP API.
 * Falls back to mock if no API key is configured.
 */

import { logger } from "../lib/logger.js";
import type { ISTTProvider } from "./interfaces.js";

interface DeepgramConfig {
  apiKey: string;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
}

export function createDeepgramSTTProvider(cfg: DeepgramConfig): ISTTProvider {
  return {
    async transcribe(audioBuffer: Buffer, format?: string): Promise<{ text: string; confidence: number }> {
      const contentType = format === "mulaw" ? "audio/mulaw" :
                         format === "mp3" ? "audio/mpeg" :
                         format === "ogg" ? "audio/ogg" :
                         "audio/wav";

      const params = new URLSearchParams({
        model: "nova-2",
        language: "en-US",
        punctuate: "true",
      });

      const response = await fetch(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${cfg.apiKey}`,
            "Content-Type": contentType,
          },
          body: audioBuffer,
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        logger.error("deepgram_stt_failed", { status: response.status, error: errText.slice(0, 500) });
        throw new Error(`Deepgram STT failed (HTTP ${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = (await response.json()) as DeepgramResponse;
      const alt = data.results?.channels?.[0]?.alternatives?.[0];

      const text = alt?.transcript || "";
      const confidence = alt?.confidence || 0;

      logger.info("deepgram_stt_success", { textLength: text.length, confidence });

      return { text, confidence };
    },
  };
}
