/**
 * ElevenLabs TTS adapter — calls the ElevenLabs API to convert text to speech.
 * Returns raw audio buffer in the requested format (default: ulaw_8000 for Twilio).
 */

import { logger } from "../lib/logger.js";
import type { ITTSProvider, TTSSynthesizeParams, TTSSynthesizeResult } from "./interfaces.js";

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoice?: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

export function createElevenLabsTTSProvider(cfg: ElevenLabsConfig): ITTSProvider {
  const baseUrl = "https://api.elevenlabs.io/v1";

  return {
    async synthesize(params: TTSSynthesizeParams): Promise<TTSSynthesizeResult> {
      const voiceId = params.voice ?? cfg.defaultVoice ?? "XrExE9yKIg1WjnnlVkGX"; // Amelia
      const outputFormat = params.outputFormat ?? "ulaw_8000";

      const url = `${baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.text,
          model_id: "eleven_turbo_v2_5",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error("elevenlabs_tts_failed", {
          status: response.status,
          body: errorBody.slice(0, 500),
        });
        throw new Error(`ElevenLabs TTS failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Estimate duration: ulaw_8000 is 8000 bytes/sec, other formats vary
      let durationSeconds: number;
      if (outputFormat.includes("8000")) {
        durationSeconds = Math.ceil(audioBuffer.length / 8000);
      } else if (outputFormat.includes("16000")) {
        durationSeconds = Math.ceil(audioBuffer.length / 16000);
      } else if (outputFormat.includes("22050")) {
        durationSeconds = Math.ceil(audioBuffer.length / 22050);
      } else {
        // Rough estimate based on text length (~150 words/min)
        const wordCount = params.text.split(/\s+/).length;
        durationSeconds = Math.max(1, Math.ceil(wordCount / 2.5));
      }

      logger.info("elevenlabs_tts_synthesized", {
        voiceId,
        outputFormat,
        textLength: params.text.length,
        audioBytes: audioBuffer.length,
        durationSeconds,
      });

      return { audioBuffer, durationSeconds };
    },

    async listVoices() {
      const response = await fetch(`${baseUrl}/voices`, {
        headers: { "xi-api-key": cfg.apiKey },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs voices request failed (HTTP ${response.status})`);
      }

      const data = (await response.json()) as { voices: ElevenLabsVoice[] };

      return data.voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language ?? "en",
      }));
    },
  };
}
