/**
 * OpenAI TTS adapter — text-to-speech via OpenAI's API.
 * Alternative TTS provider for Phase 13.
 */

import { logger } from "../lib/logger.js";
import type { ITTSProvider, TTSSynthesizeParams, TTSSynthesizeResult } from "./interfaces.js";

interface OpenAITTSConfig {
  apiKey: string;
  defaultVoice?: string;
}

const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy", language: "en-US" },
  { id: "echo", name: "Echo", language: "en-US" },
  { id: "fable", name: "Fable", language: "en-US" },
  { id: "onyx", name: "Onyx", language: "en-US" },
  { id: "nova", name: "Nova", language: "en-US" },
  { id: "shimmer", name: "Shimmer", language: "en-US" },
];

export function createOpenAITTSProvider(cfg: OpenAITTSConfig): ITTSProvider {
  return {
    async synthesize(params: TTSSynthesizeParams): Promise<TTSSynthesizeResult> {
      const voice = params.voice || cfg.defaultVoice || "alloy";
      const format = params.outputFormat || "mp3";

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: params.text,
          voice,
          response_format: format,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error("openai_tts_failed", { status: response.status, error: errText.slice(0, 500) });
        throw new Error(`OpenAI TTS failed (HTTP ${response.status}): ${errText.slice(0, 200)}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Estimate duration: ~150 words/minute speech rate, average 5 chars/word
      const estimatedWords = params.text.length / 5;
      const durationSeconds = Math.max(1, (estimatedWords / 150) * 60);

      logger.info("openai_tts_success", {
        voice,
        format,
        textLength: params.text.length,
        audioSize: audioBuffer.length,
      });

      return { audioBuffer, durationSeconds };
    },

    async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
      return OPENAI_VOICES;
    },
  };
}
