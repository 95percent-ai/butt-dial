/**
 * Mock TTS adapter — returns a small valid WAV file (silence) for dev and demo mode.
 * No external API calls. Used in dry tests and DEMO_MODE=true.
 */

import { logger } from "../lib/logger.js";
import type { ITTSProvider, TTSSynthesizeParams, TTSSynthesizeResult } from "./interfaces.js";

/**
 * Generates a minimal valid WAV file containing silence.
 * Format: PCM 8-bit mono, 8000 Hz, ~1 second.
 */
function generateSilentWav(durationSeconds: number): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples;
  const fileSize = 44 + dataSize; // 44-byte header + data

  const buf = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buf.write("RIFF", offset); offset += 4;
  buf.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buf.write("WAVE", offset); offset += 4;

  // fmt chunk
  buf.write("fmt ", offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;       // chunk size
  buf.writeUInt16LE(1, offset); offset += 2;         // PCM format
  buf.writeUInt16LE(1, offset); offset += 2;         // mono
  buf.writeUInt32LE(sampleRate, offset); offset += 4; // sample rate
  buf.writeUInt32LE(sampleRate, offset); offset += 4; // byte rate
  buf.writeUInt16LE(1, offset); offset += 2;         // block align
  buf.writeUInt16LE(8, offset); offset += 2;         // bits per sample

  // data chunk
  buf.write("data", offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  // Silence: 8-bit PCM silence is 128 (0x80)
  buf.fill(0x80, offset, offset + dataSize);

  return buf;
}

export function createMockTTSProvider(): ITTSProvider {
  return {
    async synthesize(params: TTSSynthesizeParams): Promise<TTSSynthesizeResult> {
      // Estimate ~150 words per minute for duration calculation
      const wordCount = params.text.split(/\s+/).length;
      const durationSeconds = Math.max(1, Math.ceil(wordCount / 2.5));

      logger.info("mock_tts_synthesize", {
        textLength: params.text.length,
        voice: params.voice ?? "mock-voice",
        format: params.outputFormat ?? "wav",
        durationSeconds,
      });

      const audioBuffer = generateSilentWav(durationSeconds);

      return { audioBuffer, durationSeconds };
    },

    async listVoices() {
      return [
        { id: "mock-voice", name: "Mock", language: "en" },
      ];
    },
  };
}
