import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";

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
