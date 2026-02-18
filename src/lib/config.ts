import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3100),
  webhookBaseUrl: z.string().default("http://localhost:3100"),
  mcpServerName: z.string().default("butt-dial-mcp"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Security
  masterSecurityToken: z.string().optional(),
  credentialsEncryptionKey: z.string().optional(),
  jwtSecret: z.string().optional(),

  // Configuration architecture
  identityMode: z.enum(["dedicated", "shared", "hybrid"]).default("dedicated"),
  isolationMode: z.enum(["single-account", "per-agent-subaccount", "per-customer-subaccount"]).default("single-account"),

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

  // Vonage (alternative telephony)
  vonageApiKey: z.string().optional(),
  vonageApiSecret: z.string().optional(),

  // Deepgram (STT)
  deepgramApiKey: z.string().optional(),

  // OpenAI (alternative TTS)
  openaiApiKey: z.string().optional(),
  openaiTtsVoice: z.string().default("alloy"),

  // S3 storage
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3Region: z.string().default("us-east-1"),
  s3PublicUrl: z.string().optional(),

  // Cloudflare R2 storage
  r2AccountId: z.string().optional(),
  r2AccessKeyId: z.string().optional(),
  r2SecretAccessKey: z.string().optional(),
  r2Bucket: z.string().optional(),
  r2PublicUrl: z.string().optional(),

  // Turso database
  tursoDatabaseUrl: z.string().optional(),
  tursoAuthToken: z.string().optional(),

  // Convex database
  convexDeploymentUrl: z.string().optional(),
  convexAdminKey: z.string().optional(),

  // LINE Messaging API
  lineChannelAccessToken: z.string().optional(),
  lineChannelSecret: z.string().optional(),
  providerLine: z.string().default("line"),

  // Anthropic (LLM for voice conversations)
  anthropicApiKey: z.string().optional(),

  // Voice conversation defaults
  voiceDefaultGreeting: z.string().default("Hello! How can I help you?"),
  voiceDefaultSystemPrompt: z.string().default("You are a helpful AI assistant. Keep your responses concise and conversational."),
  voiceDefaultVoice: z.string().default("cgSgspJ2msm6clMCkdW9"),
  voiceDefaultLanguage: z.string().default("en-US"),
  voiceMaxCallDurationMinutes: z.coerce.number().default(30),

  // Callback
  agentosCallbackUrl: z.string().default("http://localhost:3100/callback/{agentId}/inbound"),

  // Rate limit defaults
  defaultMaxActionsPerMinute: z.coerce.number().default(10),
  defaultMaxActionsPerHour: z.coerce.number().default(100),
  defaultMaxActionsPerDay: z.coerce.number().default(500),
  defaultMaxSpendPerDay: z.coerce.number().default(10),
  defaultMaxSpendPerMonth: z.coerce.number().default(100),
  defaultMaxCallsPerDaySameNumber: z.coerce.number().default(2),

  // Admin alerts
  adminWhatsappNumber: z.string().optional(),
  adminWhatsappSender: z.string().optional(),

  // CORS
  corsAllowedOrigins: z.string().optional(),

  // HTTP rate limiting
  httpRateLimitPerIp: z.coerce.number().default(60),
  httpRateLimitGlobal: z.coerce.number().default(100),

  // IP filtering
  adminIpAllowlist: z.string().optional(),
  webhookIpAllowlist: z.string().optional(),
  ipDenylist: z.string().optional(),

  // Anomaly detector
  anomalyDetectorEnabled: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),

  // Translation
  translationEnabled: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Registration
  registrationEnabled: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Billing
  billingMarkupPercent: z.coerce.number().default(0),

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
    identityMode: process.env.IDENTITY_MODE,
    isolationMode: process.env.ISOLATION_MODE,
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
    vonageApiKey: process.env.VONAGE_API_KEY,
    vonageApiSecret: process.env.VONAGE_API_SECRET,
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiTtsVoice: process.env.OPENAI_TTS_VOICE,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    s3PublicUrl: process.env.S3_PUBLIC_URL,
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    r2Bucket: process.env.R2_BUCKET,
    r2PublicUrl: process.env.R2_PUBLIC_URL,
    tursoDatabaseUrl: process.env.TURSO_DATABASE_URL,
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN,
    convexDeploymentUrl: process.env.CONVEX_DEPLOYMENT_URL,
    convexAdminKey: process.env.CONVEX_ADMIN_KEY,
    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET,
    providerLine: process.env.PROVIDER_LINE,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    voiceDefaultGreeting: process.env.VOICE_DEFAULT_GREETING,
    voiceDefaultSystemPrompt: process.env.VOICE_DEFAULT_SYSTEM_PROMPT,
    voiceDefaultVoice: process.env.VOICE_DEFAULT_VOICE,
    voiceDefaultLanguage: process.env.VOICE_DEFAULT_LANGUAGE,
    voiceMaxCallDurationMinutes: process.env.VOICE_MAX_CALL_DURATION_MINUTES,
    agentosCallbackUrl: process.env.AGENTOS_CALLBACK_URL,
    defaultMaxActionsPerMinute: process.env.DEFAULT_MAX_ACTIONS_PER_MINUTE,
    defaultMaxActionsPerHour: process.env.DEFAULT_MAX_ACTIONS_PER_HOUR,
    defaultMaxActionsPerDay: process.env.DEFAULT_MAX_ACTIONS_PER_DAY,
    defaultMaxSpendPerDay: process.env.DEFAULT_MAX_SPEND_PER_DAY,
    defaultMaxSpendPerMonth: process.env.DEFAULT_MAX_SPEND_PER_MONTH,
    defaultMaxCallsPerDaySameNumber: process.env.DEFAULT_MAX_CALLS_PER_DAY_SAME_NUMBER,
    adminWhatsappNumber: process.env.ADMIN_WHATSAPP_NUMBER,
    adminWhatsappSender: process.env.ADMIN_WHATSAPP_SENDER,
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
    httpRateLimitPerIp: process.env.HTTP_RATE_LIMIT_PER_IP,
    httpRateLimitGlobal: process.env.HTTP_RATE_LIMIT_GLOBAL,
    adminIpAllowlist: process.env.ADMIN_IP_ALLOWLIST,
    webhookIpAllowlist: process.env.WEBHOOK_IP_ALLOWLIST,
    ipDenylist: process.env.IP_DENYLIST,
    anomalyDetectorEnabled: process.env.ANOMALY_DETECTOR_ENABLED,
    translationEnabled: process.env.TRANSLATION_ENABLED,
    registrationEnabled: process.env.REGISTRATION_ENABLED,
    billingMarkupPercent: process.env.BILLING_MARKUP_PERCENT,
    demoMode: process.env.DEMO_MODE,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }

  const data = result.data;

  logStartupWarnings(data);

  return data;
}

function logStartupWarnings(cfg: z.infer<typeof configSchema>): void {
  if (cfg.demoMode) return;

  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
    console.warn("[WARN] No Twilio credentials — SMS, voice, and WhatsApp will use mock adapters");
  }

  if (!cfg.resendApiKey) {
    console.warn("[WARN] No Resend API key — email will use mock adapter");
  }

  if (cfg.webhookBaseUrl.includes("localhost")) {
    console.warn("[WARN] Webhook URL is localhost — inbound webhooks won't work externally");
  }

  if (!cfg.masterSecurityToken) {
    console.warn("[WARN] No master security token — tool calls will be unauthenticated");
  }

  if (!cfg.elevenlabsApiKey) {
    console.info("[INFO] No ElevenLabs key — using Edge TTS (free)");
  }

  if (!cfg.anthropicApiKey) {
    console.info("[INFO] No Anthropic key — answering machine disabled");
  }

  if (cfg.identityMode !== "dedicated") {
    console.warn(`[WARN] Identity mode "${cfg.identityMode}" is not yet implemented — only "dedicated" is supported`);
  }

  if (cfg.isolationMode !== "single-account") {
    console.warn(`[WARN] Isolation mode "${cfg.isolationMode}" is not yet implemented — only "single-account" is supported`);
  }
}

export const config = loadConfig();
export type Config = z.infer<typeof configSchema>;
