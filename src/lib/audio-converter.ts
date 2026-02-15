/**
 * Audio format conversion utilities.
 * Converts between PCM, mu-law 8kHz, and other formats for telephony.
 * Uses Node.js built-in APIs — no external dependencies.
 */

import { logger } from "./logger.js";

/**
 * Linear PCM 16-bit sample to mu-law compressed sample.
 * ITU-T G.711 standard.
 */
function linearToMulaw(sample: number): number {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  const sign = sample < 0 ? 0x80 : 0;

  if (sample < 0) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;

  sample += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    // find the segment
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;

  return mulawByte;
}

/**
 * Mu-law compressed sample to linear PCM 16-bit sample.
 */
function mulawToLinear(mulawByte: number): number {
  mulawByte = ~mulawByte & 0xff;
  const sign = mulawByte & 0x80;
  const exponent = (mulawByte >> 4) & 0x07;
  const mantissa = mulawByte & 0x0f;

  let sample = (mantissa << (exponent + 3)) + (1 << (exponent + 3)) - 33;
  if (sign) sample = -sample;

  return sample;
}

/**
 * Convert PCM 16-bit LE audio buffer to mu-law 8kHz.
 * Input: PCM 16-bit little-endian samples at any sample rate.
 * Output: mu-law encoded bytes at 8kHz.
 */
export function pcmToMulaw(pcmBuffer: Buffer, inputSampleRate: number = 16000): Buffer {
  const ratio = inputSampleRate / 8000;
  const inputSamples = pcmBuffer.length / 2; // 16-bit = 2 bytes per sample
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = Math.floor(i * ratio) * 2;
    if (srcIndex + 1 >= pcmBuffer.length) break;
    const sample = pcmBuffer.readInt16LE(srcIndex);
    output[i] = linearToMulaw(sample);
  }

  logger.info("audio_convert_pcm_to_mulaw", {
    inputSize: pcmBuffer.length,
    inputSampleRate,
    outputSize: output.length,
    outputSampleRate: 8000,
  });

  return output;
}

/**
 * Convert mu-law 8kHz buffer to PCM 16-bit LE at specified sample rate.
 */
export function mulawToPcm(mulawBuffer: Buffer, outputSampleRate: number = 16000): Buffer {
  const ratio = outputSampleRate / 8000;
  const outputSamples = Math.floor(mulawBuffer.length * ratio);
  const output = Buffer.alloc(outputSamples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = Math.min(Math.floor(i / ratio), mulawBuffer.length - 1);
    const sample = mulawToLinear(mulawBuffer[srcIndex]);
    output.writeInt16LE(sample, i * 2);
  }

  logger.info("audio_convert_mulaw_to_pcm", {
    inputSize: mulawBuffer.length,
    inputSampleRate: 8000,
    outputSize: output.length,
    outputSampleRate,
  });

  return output;
}

/**
 * Create a minimal WAV header for raw PCM data.
 */
export function wrapPcmAsWav(pcmBuffer: Buffer, sampleRate: number = 8000, channels: number = 1, bitsPerSample: number = 16): Buffer {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // byte rate
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}
