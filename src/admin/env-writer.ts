import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CatalogProvider } from "./provider-catalog.js";

const ENV_PATH = join(process.cwd(), ".env");
const ENV_TMP_PATH = join(process.cwd(), ".env.tmp");

interface ProviderStatus {
  twilio: {
    configured: boolean;
    accountSid: string | null; // masked
    authToken: string | null; // masked
  };
  elevenlabs: {
    configured: boolean;
    apiKey: string | null; // masked
  };
  resend: {
    configured: boolean;
    apiKey: string | null; // masked
  };
  server: {
    configured: boolean;
    webhookBaseUrl: string | null;
    orchestratorSecurityToken: string | null; // masked
  };
  voice: {
    configured: boolean;
    greeting: string | null;
    voice: string | null;
    language: string | null;
    systemPrompt: string | null;
    ttsProvider: string | null;
  };
  registration: {
    requireEmailVerification: boolean;
  };
}

/** Mask a value — show only last 4 characters */
function mask(value: string): string {
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

/** Parse .env file into ordered entries (preserves comments, blanks, ordering) */
function parseEnvFile(content: string): Array<{ line: string; key?: string; value?: string }> {
  const entries: Array<{ line: string; key?: string; value?: string }> = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) {
      entries.push({ line, key: match[1], value: match[2] });
    } else {
      entries.push({ line });
    }
  }

  return entries;
}

/** Read .env and return which providers are configured (masked values) */
export function getProviderStatus(): ProviderStatus {
  const env: Record<string, string> = {};

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const entry of parseEnvFile(content)) {
      if (entry.key && entry.value !== undefined && entry.value !== "") {
        env[entry.key] = entry.value;
      }
    }
  }

  const twilioSid = env["TWILIO_ACCOUNT_SID"];
  const twilioToken = env["TWILIO_AUTH_TOKEN"];
  const elevenKey = env["ELEVENLABS_API_KEY"];
  const resendKey = env["RESEND_API_KEY"];
  const webhookUrl = env["WEBHOOK_BASE_URL"];
  const orchToken = env["ORCHESTRATOR_SECURITY_TOKEN"] || env["MASTER_SECURITY_TOKEN"];
  const voiceGreeting = env["VOICE_DEFAULT_GREETING"];
  const voiceVoice = env["VOICE_DEFAULT_VOICE"];
  const voiceLang = env["VOICE_DEFAULT_LANGUAGE"];
  const voiceSystemPrompt = env["VOICE_DEFAULT_SYSTEM_PROMPT"];
  const ttsProvider = env["PROVIDER_TTS"];
  const anthropicKey = env["ANTHROPIC_API_KEY"];
  const requireEmailVerification = env["REQUIRE_EMAIL_VERIFICATION"];

  return {
    twilio: {
      configured: !!(twilioSid && twilioToken),
      accountSid: twilioSid ? mask(twilioSid) : null,
      authToken: twilioToken ? mask(twilioToken) : null,
    },
    elevenlabs: {
      configured: !!elevenKey,
      apiKey: elevenKey ? mask(elevenKey) : null,
    },
    resend: {
      configured: !!resendKey,
      apiKey: resendKey ? mask(resendKey) : null,
    },
    server: {
      configured: !!(webhookUrl && orchToken),
      webhookBaseUrl: webhookUrl || null,
      orchestratorSecurityToken: orchToken ? mask(orchToken) : null,
    },
    voice: {
      configured: !!(voiceGreeting || voiceVoice || voiceLang),
      greeting: voiceGreeting || null,
      voice: voiceVoice || null,
      language: voiceLang || null,
      systemPrompt: voiceSystemPrompt || null,
      ttsProvider: ttsProvider || null,
    },
    registration: {
      requireEmailVerification: requireEmailVerification === "true",
    },
  };
}

/** Write credentials to .env — preserves existing lines/comments/ordering */
export function saveCredentials(credentials: Record<string, string>): void {
  let entries: Array<{ line: string; key?: string; value?: string }>;

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    entries = parseEnvFile(content);
  } else {
    entries = [];
  }

  const written = new Set<string>();

  // Update existing lines
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.key && entry.key in credentials) {
      entries[i] = {
        line: `${entry.key}=${credentials[entry.key]}`,
        key: entry.key,
        value: credentials[entry.key],
      };
      written.add(entry.key);
    }
  }

  // Append new keys that weren't already in the file
  for (const [key, value] of Object.entries(credentials)) {
    if (!written.has(key)) {
      entries.push({ line: `${key}=${value}`, key, value });
    }
  }

  const output = entries.map((e) => e.line).join("\n");

  // Atomic write: write to .env.tmp then rename
  writeFileSync(ENV_TMP_PATH, output, "utf-8");
  renameSync(ENV_TMP_PATH, ENV_PATH);
}

/** Delete specific env keys from .env — sets them to empty string */
export function deleteCredentials(keys: string[]): void {
  if (!existsSync(ENV_PATH)) return;

  const content = readFileSync(ENV_PATH, "utf-8");
  let entries = parseEnvFile(content);

  const keysToDelete = new Set(keys);

  // Remove matching lines entirely
  entries = entries.filter((entry) => {
    if (entry.key && keysToDelete.has(entry.key)) {
      return false; // remove this line
    }
    return true;
  });

  const output = entries.map((e) => e.line).join("\n");
  writeFileSync(ENV_TMP_PATH, output, "utf-8");
  renameSync(ENV_TMP_PATH, ENV_PATH);
}

/** Read .env and cross-reference the catalog to find which providers have credentials set */
export function getConfiguredProviders(catalog: CatalogProvider[]): Array<{
  id: string;
  name: string;
  type: string;
  configured: boolean;
  disabled: boolean;
  fields: Record<string, string>; // masked values
}> {
  const env: Record<string, string> = {};

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const entry of parseEnvFile(content)) {
      if (entry.key && entry.value !== undefined) {
        env[entry.key] = entry.value;
      }
    }
  }

  const result: Array<{
    id: string;
    name: string;
    type: string;
    configured: boolean;
    disabled: boolean;
    fields: Record<string, string>;
  }> = [];

  for (const provider of catalog) {
    // Check if any required fields are set
    const fieldValues: Record<string, string> = {};
    let hasAnyField = false;

    for (const field of provider.fields) {
      const val = env[field.envKey];
      if (val && val.length > 0) {
        fieldValues[field.key] = mask(val);
        hasAnyField = true;
      }
    }

    // Edge TTS has no fields — it's always "configured"
    if (provider.fields.length === 0) {
      hasAnyField = true;
    }

    if (hasAnyField) {
      const disabledKey = `PROVIDER_${provider.id.toUpperCase().replace(/-/g, "_")}_DISABLED`;
      const isDisabled = env[disabledKey] === "true";

      result.push({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        configured: true,
        disabled: isDisabled,
        fields: fieldValues,
      });
    }
  }

  return result;
}
