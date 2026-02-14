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

  // Email, WhatsApp, TTS, STT, voice, storage — stubs for now
  // Real adapters will be added in their respective phases
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
