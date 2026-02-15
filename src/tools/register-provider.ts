/**
 * comms_register_provider — MCP tool to register/verify third-party credentials.
 * Tests connectivity, writes credentials to .env, returns status.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { saveCredentials } from "../admin/env-writer.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { requireAdmin, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { encrypt } from "../security/crypto.js";

const PROVIDER_CONFIGS: Record<string, {
  envMapping: Record<string, string>;
  verifyUrl?: string;
  capabilities: string[];
}> = {
  twilio: {
    envMapping: {
      accountSid: "TWILIO_ACCOUNT_SID",
      authToken: "TWILIO_AUTH_TOKEN",
    },
    capabilities: ["sms", "voice", "whatsapp", "phone-numbers"],
  },
  resend: {
    envMapping: {
      apiKey: "RESEND_API_KEY",
    },
    capabilities: ["email", "domain-verification"],
  },
  elevenlabs: {
    envMapping: {
      apiKey: "ELEVENLABS_API_KEY",
    },
    capabilities: ["tts", "voice-cloning"],
  },
  anthropic: {
    envMapping: {
      apiKey: "ANTHROPIC_API_KEY",
    },
    capabilities: ["llm", "voice-ai-conversations"],
  },
};

async function verifyProvider(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "twilio") {
      const sid = credentials.accountSid;
      const token = credentials.authToken;
      if (!sid || !token) return { ok: false, message: "Missing accountSid or authToken" };

      const authHeader = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: authHeader },
      });
      if (!resp.ok) return { ok: false, message: `Twilio API returned HTTP ${resp.status}` };
      return { ok: true, message: "Twilio credentials verified" };
    }

    if (provider === "resend") {
      const apiKey = credentials.apiKey;
      if (!apiKey) return { ok: false, message: "Missing apiKey" };

      const resp = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return { ok: false, message: `Resend API returned HTTP ${resp.status}` };
      return { ok: true, message: "Resend credentials verified" };
    }

    if (provider === "elevenlabs") {
      const apiKey = credentials.apiKey;
      if (!apiKey) return { ok: false, message: "Missing apiKey" };

      const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });
      if (!resp.ok) return { ok: false, message: `ElevenLabs API returned HTTP ${resp.status}` };
      return { ok: true, message: "ElevenLabs credentials verified" };
    }

    if (provider === "anthropic") {
      // No simple ping endpoint; just validate key format
      const apiKey = credentials.apiKey;
      if (!apiKey) return { ok: false, message: "Missing apiKey" };
      if (!apiKey.startsWith("sk-ant-")) return { ok: false, message: "Invalid Anthropic API key format" };
      return { ok: true, message: "Anthropic key format validated (no live ping)" };
    }

    return { ok: false, message: `Unknown provider: ${provider}` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Verification failed: ${errMsg}` };
  }
}

export function registerRegisterProviderTool(server: McpServer): void {
  server.tool(
    "comms_register_provider",
    "Register and verify third-party provider credentials (Twilio, Resend, ElevenLabs, Anthropic). Saves to .env file.",
    {
      provider: z.enum(["twilio", "resend", "elevenlabs", "anthropic"]).describe("Provider name"),
      credentials: z.record(z.string()).describe("Credential key-value pairs (e.g. { accountSid: '...', authToken: '...' })"),
      autoVerify: z.boolean().default(true).describe("Test connectivity before saving (default: true)"),
    },
    async ({ provider, credentials, autoVerify }, extra) => {
      // Auth: only admin can register providers
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const providerConfig = PROVIDER_CONFIGS[provider];

      if (!providerConfig) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown provider: ${provider}` }) }],
          isError: true,
        };
      }

      // Verify if requested
      if (autoVerify) {
        const verification = await verifyProvider(provider, credentials);
        if (!verification.ok) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: `Verification failed for ${provider}: ${verification.message}`,
                provider,
                verified: false,
              }),
            }],
            isError: true,
          };
        }
      }

      // Map credentials to env var names
      const envCredentials: Record<string, string> = {};
      for (const [key, value] of Object.entries(credentials)) {
        const envKey = providerConfig.envMapping[key];
        if (envKey) {
          envCredentials[envKey] = value;
        }
      }

      if (Object.keys(envCredentials).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `No recognized credential keys for ${provider}. Expected: ${Object.keys(providerConfig.envMapping).join(", ")}`,
            }),
          }],
          isError: true,
        };
      }

      // Write to .env
      saveCredentials(envCredentials);

      // Also store encrypted in DB if encryption key is configured
      if (config.credentialsEncryptionKey) {
        const db = getProvider("database");
        for (const [key, value] of Object.entries(credentials)) {
          const envKey = providerConfig.envMapping[key];
          if (!envKey) continue;
          const encrypted = encrypt(value, config.credentialsEncryptionKey);
          db.run(
            `INSERT INTO provider_credentials (id, provider, credential_key, encrypted_value, iv, auth_tag)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(provider, credential_key) DO UPDATE SET
               encrypted_value = excluded.encrypted_value,
               iv = excluded.iv,
               auth_tag = excluded.auth_tag,
               updated_at = datetime('now')`,
            [randomUUID(), provider, envKey, encrypted.encrypted, encrypted.iv, encrypted.authTag]
          );
        }
      }

      logger.info("provider_registered", {
        provider,
        keys: Object.keys(envCredentials),
        verified: autoVerify,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            provider,
            verified: autoVerify,
            capabilities: providerConfig.capabilities,
            envKeysWritten: Object.keys(envCredentials),
            note: "Restart the server to apply new credentials.",
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_register_provider" });
}
