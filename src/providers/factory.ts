import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type {
  ITelephonyProvider,
  IEmailProvider,
  IWhatsAppProvider,
  ITTSProvider,
  ISTTProvider,
  IVoiceOrchestrator,
  IDBProvider,
  IStorageProvider,
} from "./interfaces.js";
import { createSqliteProvider } from "../db/client.js";
import { createMockTelephonyProvider } from "./telephony-mock.js";
import { createTwilioTelephonyProvider } from "./telephony-twilio.js";
import { createMockTTSProvider } from "./tts-mock.js";
import { createElevenLabsTTSProvider } from "./tts-elevenlabs.js";
import { createEdgeTTSProvider } from "./tts-edge.js";
import { createLocalStorageProvider } from "./storage-local.js";
import { createConversationRelayOrchestrator } from "./voice-conversation-relay.js";
import { createMockVoiceOrchestrator } from "./voice-mock.js";
import { createMockEmailProvider } from "./email-mock.js";
import { createResendEmailProvider } from "./email-resend.js";
import { createMockWhatsAppProvider } from "./whatsapp-mock.js";
import { createTwilioWhatsAppProvider } from "./whatsapp-twilio.js";

type ProviderMap = {
  telephony: ITelephonyProvider;
  email: IEmailProvider;
  whatsapp: IWhatsAppProvider;
  tts: ITTSProvider;
  stt: ISTTProvider;
  voiceOrchestration: IVoiceOrchestrator;
  database: IDBProvider;
  storage: IStorageProvider;
};

const providers: Partial<ProviderMap> = {};

function stubProvider(slot: string): never {
  throw new Error(`Provider "${slot}" is not yet implemented. Configure it in .env or register via comms_register_provider.`);
}

export function getProvider<K extends keyof ProviderMap>(slot: K): ProviderMap[K] {
  if (providers[slot]) {
    return providers[slot] as ProviderMap[K];
  }
  throw new Error(`Provider "${slot}" has not been initialized. Call initProviders() first.`);
}

export function initProviders(): void {
  // Database — always initialized first (other providers may need it)
  if (config.providerDatabase === "sqlite") {
    providers.database = createSqliteProvider();
    logger.info("provider_initialized", { slot: "database", provider: "sqlite" });
  } else {
    logger.warn("provider_not_implemented", { slot: "database", provider: config.providerDatabase });
  }

  // Telephony
  if (config.demoMode) {
    providers.telephony = createMockTelephonyProvider();
    logger.info("provider_initialized", { slot: "telephony", provider: "mock (demo mode)" });
  } else if (config.twilioAccountSid && config.twilioAuthToken) {
    providers.telephony = createTwilioTelephonyProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
    });
    logger.info("provider_initialized", { slot: "telephony", provider: "twilio" });
  } else {
    providers.telephony = createMockTelephonyProvider();
    logger.warn("provider_fallback_mock", {
      slot: "telephony",
      reason: "No Twilio credentials found — using mock adapter",
    });
  }

  // TTS
  if (config.demoMode) {
    providers.tts = createMockTTSProvider();
    logger.info("provider_initialized", { slot: "tts", provider: "mock (demo mode)" });
  } else if (config.elevenlabsApiKey) {
    providers.tts = createElevenLabsTTSProvider({
      apiKey: config.elevenlabsApiKey,
      defaultVoice: config.elevenlabsDefaultVoice,
    });
    logger.info("provider_initialized", { slot: "tts", provider: "elevenlabs" });
  } else {
    providers.tts = createEdgeTTSProvider();
    logger.info("provider_initialized", { slot: "tts", provider: "edge-tts (free, no API key)" });
  }

  // Storage — always local for now
  providers.storage = createLocalStorageProvider();
  logger.info("provider_initialized", { slot: "storage", provider: "local" });

  // Voice orchestration
  if (config.demoMode) {
    providers.voiceOrchestration = createMockVoiceOrchestrator();
    logger.info("provider_initialized", { slot: "voiceOrchestration", provider: "mock (demo mode)" });
  } else {
    providers.voiceOrchestration = createConversationRelayOrchestrator();
    logger.info("provider_initialized", { slot: "voiceOrchestration", provider: "conversation-relay" });
  }

  // Email
  if (config.demoMode) {
    providers.email = createMockEmailProvider();
    logger.info("provider_initialized", { slot: "email", provider: "mock (demo mode)" });
  } else if (config.resendApiKey) {
    providers.email = createResendEmailProvider({ apiKey: config.resendApiKey });
    logger.info("provider_initialized", { slot: "email", provider: "resend" });
  } else {
    providers.email = createMockEmailProvider();
    logger.warn("provider_fallback_mock", {
      slot: "email",
      reason: "No Resend API key found — using mock adapter",
    });
  }

  // WhatsApp
  if (config.demoMode) {
    providers.whatsapp = createMockWhatsAppProvider();
    logger.info("provider_initialized", { slot: "whatsapp", provider: "mock (demo mode)" });
  } else if (config.twilioAccountSid && config.twilioAuthToken) {
    providers.whatsapp = createTwilioWhatsAppProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
    });
    logger.info("provider_initialized", { slot: "whatsapp", provider: "twilio" });
  } else {
    providers.whatsapp = createMockWhatsAppProvider();
    logger.warn("provider_fallback_mock", {
      slot: "whatsapp",
      reason: "No Twilio credentials found — using mock adapter",
    });
  }

  // STT — stub for now
  logger.info("providers_init_complete", {
    database: config.providerDatabase,
    telephony: config.demoMode ? "mock" : config.providerTelephony,
    email: config.providerEmail + " (pending)",
    whatsapp: config.providerWhatsapp + " (pending)",
    tts: config.providerTts + " (pending)",
    stt: config.providerStt + " (pending)",
    voiceOrchestration: config.providerVoiceOrchestration + " (pending)",
    storage: config.providerStorage + " (pending)",
  });
}
