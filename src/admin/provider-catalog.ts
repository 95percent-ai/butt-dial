/**
 * Provider Catalog — single source of truth for all provider metadata.
 * Shared by the API (router.ts) and UI (unified-admin.ts).
 * Database providers (SQLite, Turso, Convex) are excluded — they stay internal.
 */

export interface CatalogField {
  key: string;       // credential key name (e.g. "accountSid")
  envKey: string;     // env var name (e.g. "TWILIO_ACCOUNT_SID")
  label: string;      // display label (e.g. "Account SID")
  placeholder: string;
  type: "text" | "password";
}

export interface CatalogProvider {
  id: string;
  name: string;
  type: "telephony" | "email" | "tts" | "stt" | "ai-assistant" | "messaging" | "storage";
  description: string;
  services: string[];
  costInfo: string;
  fields: CatalogField[];
  testable: boolean;
}

export const PROVIDER_CATALOG: CatalogProvider[] = [
  // ── Telephony ──────────────────────────────────────────────────
  {
    id: "twilio",
    name: "Twilio",
    type: "telephony",
    description: "SMS, WhatsApp, and Voice calls. The primary telephony provider.",
    services: ["SMS", "Voice", "WhatsApp", "Phone Numbers"],
    costInfo: "Pay-as-you-go. ~$0.0079/SMS, ~$0.014/min voice (US).",
    fields: [
      { key: "accountSid", envKey: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text" },
      { key: "authToken", envKey: "TWILIO_AUTH_TOKEN", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
    ],
    testable: true,
  },
  {
    id: "vonage",
    name: "Vonage",
    type: "telephony",
    description: "Alternative telephony provider for SMS and voice.",
    services: ["SMS", "Voice", "Phone Numbers"],
    costInfo: "Pay-as-you-go. ~$0.0068/SMS, ~$0.014/min voice (US).",
    fields: [
      { key: "apiKey", envKey: "VONAGE_API_KEY", label: "API Key", placeholder: "Your Vonage API key", type: "text" },
      { key: "apiSecret", envKey: "VONAGE_API_SECRET", label: "API Secret", placeholder: "Your Vonage API secret", type: "password" },
    ],
    testable: true,
  },

  // ── Email ──────────────────────────────────────────────────────
  {
    id: "resend",
    name: "Resend",
    type: "email",
    description: "Transactional email sending and domain verification.",
    services: ["Email", "Domain Verification"],
    costInfo: "Free tier: 100 emails/day. Paid from $20/mo.",
    fields: [
      { key: "apiKey", envKey: "RESEND_API_KEY", label: "API Key", placeholder: "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password" },
    ],
    testable: true,
  },

  // ── TTS ────────────────────────────────────────────────────────
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    type: "tts",
    description: "High-quality AI voice synthesis with voice cloning.",
    services: ["Text-to-Speech", "Voice Cloning"],
    costInfo: "Free tier: 10K chars/mo. Starter $5/mo (30K chars).",
    fields: [
      { key: "apiKey", envKey: "ELEVENLABS_API_KEY", label: "API Key", placeholder: "Your ElevenLabs API key", type: "password" },
    ],
    testable: true,
  },
  {
    id: "openai-tts",
    name: "OpenAI TTS",
    type: "tts",
    description: "OpenAI text-to-speech with multiple voice options.",
    services: ["Text-to-Speech"],
    costInfo: "$15/1M chars (tts-1), $30/1M chars (tts-1-hd).",
    fields: [
      { key: "apiKey", envKey: "OPENAI_API_KEY", label: "API Key", placeholder: "sk-...", type: "password" },
    ],
    testable: true,
  },
  {
    id: "edge-tts",
    name: "Edge TTS",
    type: "tts",
    description: "Free Microsoft Edge text-to-speech. No API key needed.",
    services: ["Text-to-Speech"],
    costInfo: "Free — no API key required.",
    fields: [],
    testable: false,
  },

  // ── STT ────────────────────────────────────────────────────────
  {
    id: "deepgram",
    name: "Deepgram",
    type: "stt",
    description: "Fast and accurate speech-to-text transcription.",
    services: ["Speech-to-Text"],
    costInfo: "Free tier: $200 credit. Pay-as-you-go from $0.0043/min.",
    fields: [
      { key: "apiKey", envKey: "DEEPGRAM_API_KEY", label: "API Key", placeholder: "Your Deepgram API key", type: "password" },
    ],
    testable: true,
  },

  // ── AI Assistant ───────────────────────────────────────────────
  {
    id: "anthropic",
    name: "Anthropic",
    type: "ai-assistant",
    description: "Claude AI for the fallback answering machine when agents are offline.",
    services: ["Answering Machine", "AI Responses"],
    costInfo: "Pay-per-token. Haiku: $0.25/1M input, $1.25/1M output.",
    fields: [
      { key: "apiKey", envKey: "ANTHROPIC_API_KEY", label: "API Key", placeholder: "sk-ant-...", type: "password" },
    ],
    testable: true,
  },

  // ── Messaging ──────────────────────────────────────────────────
  {
    id: "whatsapp-twilio",
    name: "WhatsApp (Twilio)",
    type: "messaging",
    description: "WhatsApp Business API via Twilio. Uses your existing Twilio credentials.",
    services: ["WhatsApp Messages", "WhatsApp Templates"],
    costInfo: "Included with Twilio. ~$0.005/msg (US).",
    fields: [
      { key: "accountSid", envKey: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text" },
      { key: "authToken", envKey: "TWILIO_AUTH_TOKEN", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
    ],
    testable: true,
  },
  {
    id: "line",
    name: "LINE",
    type: "messaging",
    description: "LINE Messaging API for sending and receiving LINE messages.",
    services: ["LINE Messages"],
    costInfo: "Free tier: 500 messages/mo. Paid plans available.",
    fields: [
      { key: "channelAccessToken", envKey: "LINE_CHANNEL_ACCESS_TOKEN", label: "Channel Access Token", placeholder: "Your LINE channel access token", type: "password" },
      { key: "channelSecret", envKey: "LINE_CHANNEL_SECRET", label: "Channel Secret", placeholder: "Your LINE channel secret", type: "password" },
    ],
    testable: true,
  },

  // ── Storage ────────────────────────────────────────────────────
  {
    id: "s3",
    name: "AWS S3",
    type: "storage",
    description: "Amazon S3 for audio file and media storage.",
    services: ["File Storage", "Audio Storage"],
    costInfo: "~$0.023/GB/mo (Standard). Free tier: 5GB for 12 months.",
    fields: [
      { key: "accessKeyId", envKey: "AWS_ACCESS_KEY_ID", label: "Access Key ID", placeholder: "AKIA...", type: "text" },
      { key: "secretAccessKey", envKey: "AWS_SECRET_ACCESS_KEY", label: "Secret Access Key", placeholder: "Your AWS secret key", type: "password" },
      { key: "bucket", envKey: "S3_BUCKET", label: "Bucket Name", placeholder: "my-bucket", type: "text" },
      { key: "region", envKey: "S3_REGION", label: "Region", placeholder: "us-east-1", type: "text" },
    ],
    testable: false,
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    type: "storage",
    description: "Cloudflare R2 object storage — S3-compatible, no egress fees.",
    services: ["File Storage", "Audio Storage"],
    costInfo: "Free tier: 10GB. $0.015/GB/mo after. No egress fees.",
    fields: [
      { key: "accountId", envKey: "R2_ACCOUNT_ID", label: "Account ID", placeholder: "Your Cloudflare account ID", type: "text" },
      { key: "accessKeyId", envKey: "R2_ACCESS_KEY_ID", label: "Access Key ID", placeholder: "R2 access key", type: "text" },
      { key: "secretAccessKey", envKey: "R2_SECRET_ACCESS_KEY", label: "Secret Access Key", placeholder: "R2 secret key", type: "password" },
      { key: "bucket", envKey: "R2_BUCKET", label: "Bucket Name", placeholder: "my-bucket", type: "text" },
    ],
    testable: false,
  },
];

/** Get a provider from the catalog by ID */
export function getCatalogProvider(id: string): CatalogProvider | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

/** Get all env keys from the catalog (for the allowed-keys whitelist) */
export function getAllCatalogEnvKeys(): string[] {
  const keys: string[] = [];
  for (const provider of PROVIDER_CATALOG) {
    for (const field of provider.fields) {
      keys.push(field.envKey);
    }
  }
  return keys;
}

/** Type color mapping for UI badges */
export const PROVIDER_TYPE_COLORS: Record<string, string> = {
  telephony: "#58a6ff",
  email: "#d2a8ff",
  tts: "#3fb950",
  stt: "#f0883e",
  "ai-assistant": "#f778ba",
  messaging: "#56d364",
  storage: "#8b949e",
};
