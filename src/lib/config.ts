import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3100),
  webhookBaseUrl: z.string().default("http://localhost:3100"),
  mcpServerName: z.string().default("agentos-comms"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Security
  masterSecurityToken: z.string().optional(),
  credentialsEncryptionKey: z.string().optional(),
  jwtSecret: z.string().optional(),

  // Agent pool
  initialAgentPoolSize: z.coerce.number().default(5),

  // Provider selection
  providerTelephony: z.string().default("twilio"),
  providerEmail: z.string().default("resend"),
  providerWhatsapp: z.string().default("greenapi"),
  providerTts: z.string().default("edge-tts"),
  providerStt: z.string().default("deepgram"),
  providerVoiceOrchestration: z.string().default("twilio-conversation-relay"),
  providerDatabase: z.string().default("sqlite"),
  providerStorage: z.string().default("local"),

  // Twilio
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioApiKey: z.string().optional(),
  twilioApiSecret: z.string().optional(),

  // ElevenLabs
  elevenlabsApiKey: z.string().optional(),
  elevenlabsDefaultVoice: z.string().optional(),

  // Resend (email)
  resendApiKey: z.string().optional(),
  resendWebhookSecret: z.string().optional(),

  // Email default domain (for provisioned agents)
  emailDefaultDomain: z.string().default("agents.example.com"),

  // Anthropic (LLM for voice conversations)
  anthropicApiKey: z.string().optional(),

  // Voice conversation defaults
  voiceDefaultGreeting: z.string().default("Hello! How can I help you?"),
  voiceDefaultSystemPrompt: z.string().default("You are a helpful AI assistant. Keep your responses concise and conversational."),
  voiceDefaultVoice: z.string().default("cgSgspJ2msm6clMCkdW9"),
  voiceDefaultLanguage: z.string().default("en-US"),

  // Callback
  agentosCallbackUrl: z.string().default("http://localhost:3100/callback/{agentId}/inbound"),

  // Rate limit defaults
  defaultMaxActionsPerMinute: z.coerce.number().default(10),
  defaultMaxActionsPerHour: z.coerce.number().default(100),
  defaultMaxActionsPerDay: z.coerce.number().default(500),
  defaultMaxSpendPerDay: z.coerce.number().default(10),
  defaultMaxSpendPerMonth: z.coerce.number().default(100),
  defaultMaxCallsPerDaySameNumber: z.coerce.number().default(2),

  // Demo mode
  demoMode: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

function loadConfig() {
  const raw = {
    port: process.env.PORT,
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
    mcpServerName: process.env.MCP_SERVER_NAME,
    nodeEnv: process.env.NODE_ENV,
    masterSecurityToken: process.env.MASTER_SECURITY_TOKEN,
    credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY,
    jwtSecret: process.env.JWT_SECRET,
    initialAgentPoolSize: process.env.INITIAL_AGENT_POOL_SIZE,
    providerTelephony: process.env.PROVIDER_TELEPHONY,
    providerEmail: process.env.PROVIDER_EMAIL,
    providerWhatsapp: process.env.PROVIDER_WHATSAPP,
    providerTts: process.env.PROVIDER_TTS,
    providerStt: process.env.PROVIDER_STT,
    providerVoiceOrchestration: process.env.PROVIDER_VOICE_ORCHESTRATION,
    providerDatabase: process.env.PROVIDER_DATABASE,
    providerStorage: process.env.PROVIDER_STORAGE,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioApiKey: process.env.TWILIO_API_KEY,
    twilioApiSecret: process.env.TWILIO_API_SECRET,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsDefaultVoice: process.env.ELEVENLABS_DEFAULT_VOICE,
    resendApiKey: process.env.RESEND_API_KEY,
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    emailDefaultDomain: process.env.EMAIL_DEFAULT_DOMAIN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    voiceDefaultGreeting: process.env.VOICE_DEFAULT_GREETING,
    voiceDefaultSystemPrompt: process.env.VOICE_DEFAULT_SYSTEM_PROMPT,
    voiceDefaultVoice: process.env.VOICE_DEFAULT_VOICE,
    voiceDefaultLanguage: process.env.VOICE_DEFAULT_LANGUAGE,
    agentosCallbackUrl: process.env.AGENTOS_CALLBACK_URL,
    defaultMaxActionsPerMinute: process.env.DEFAULT_MAX_ACTIONS_PER_MINUTE,
    defaultMaxActionsPerHour: process.env.DEFAULT_MAX_ACTIONS_PER_HOUR,
    defaultMaxActionsPerDay: process.env.DEFAULT_MAX_ACTIONS_PER_DAY,
    defaultMaxSpendPerDay: process.env.DEFAULT_MAX_SPEND_PER_DAY,
    defaultMaxSpendPerMonth: process.env.DEFAULT_MAX_SPEND_PER_MONTH,
    defaultMaxCallsPerDaySameNumber: process.env.DEFAULT_MAX_CALLS_PER_DAY_SAME_NUMBER,
    demoMode: process.env.DEMO_MODE,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  const data = result.data;

  // Warn if auth is not configured (but don't crash — graceful degradation for dev)
  if (!data.demoMode && !data.masterSecurityToken) {
    console.warn(
      "[SECURITY WARNING] MASTER_SECURITY_TOKEN is not set. All MCP tool calls will be unauthenticated. " +
      "Set MASTER_SECURITY_TOKEN in .env for production use."
    );
  }

  return data;
}

export const config = loadConfig();
export type Config = z.infer<typeof configSchema>;
