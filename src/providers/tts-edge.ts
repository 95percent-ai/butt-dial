/**
 * Edge TTS adapter — uses Microsoft Edge's online TTS service.
 * Free, no API key required. Good quality voices for dev and production.
 */

import { EdgeTTS } from "@andresaya/edge-tts";
import { logger } from "../lib/logger.js";
import type { ITTSProvider, TTSSynthesizeParams, TTSSynthesizeResult } from "./interfaces.js";

// Default voice — natural-sounding US English female
const DEFAULT_VOICE = "en-US-AriaNeural";

export function createEdgeTTSProvider(): ITTSProvider {
  return {
    async synthesize(params: TTSSynthesizeParams): Promise<TTSSynthesizeResult> {
      const voice = params.voice ?? DEFAULT_VOICE;
      const tts = new EdgeTTS();

      await tts.synthesize(params.text, voice, {
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      });

      const audioBuffer = tts.toBuffer();
      const info = tts.getAudioInfo();
      const durationSeconds = info.estimatedDuration ?? Math.max(1, Math.ceil(params.text.split(/\s+/).length / 2.5));

      logger.info("edge_tts_synthesized", {
        voice,
        textLength: params.text.length,
        audioBytes: audioBuffer.length,
        durationSeconds,
      });

      return { audioBuffer, durationSeconds };
    },

    async listVoices() {
      const tts = new EdgeTTS();
      const voices = await tts.getVoices();

      return voices.map((v: { ShortName: string; FriendlyName?: string; Locale: string }) => ({
        id: v.ShortName,
        name: v.FriendlyName ?? v.ShortName,
        language: v.Locale,
      }));
    },
  };
}
