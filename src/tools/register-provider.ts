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
  vonage: {
    envMapping: {
      apiKey: "VONAGE_API_KEY",
      apiSecret: "VONAGE_API_SECRET",
    },
    capabilities: ["sms", "voice", "phone-numbers"],
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
  openai: {
    envMapping: {
      apiKey: "OPENAI_API_KEY",
    },
    capabilities: ["tts"],
  },
  deepgram: {
    envMapping: {
      apiKey: "DEEPGRAM_API_KEY",
    },
    capabilities: ["stt"],
  },
  s3: {
    envMapping: {
      accessKeyId: "AWS_ACCESS_KEY_ID",
      secretAccessKey: "AWS_SECRET_ACCESS_KEY",
      bucket: "S3_BUCKET",
      region: "S3_REGION",
    },
    capabilities: ["storage"],
  },
  r2: {
    envMapping: {
      accountId: "R2_ACCOUNT_ID",
      accessKeyId: "R2_ACCESS_KEY_ID",
      secretAccessKey: "R2_SECRET_ACCESS_KEY",
      bucket: "R2_BUCKET",
    },
    capabilities: ["storage"],
  },
  turso: {
    envMapping: {
      databaseUrl: "TURSO_DATABASE_URL",
      authToken: "TURSO_AUTH_TOKEN",
    },
    capabilities: ["database"],
  },
  convex: {
    envMapping: {
      deploymentUrl: "CONVEX_DEPLOYMENT_URL",
      adminKey: "CONVEX_ADMIN_KEY",
    },
    capabilities: ["database"],
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

    if (provider === "vonage") {
      const apiKey = credentials.apiKey;
      const apiSecret = credentials.apiSecret;
      if (!apiKey || !apiSecret) return { ok: false, message: "Missing apiKey or apiSecret" };

      const resp = await fetch(`https://rest.nexmo.com/account/get-balance?api_key=${apiKey}&api_secret=${apiSecret}`);
      if (!resp.ok) return { ok: false, message: `Vonage API returned HTTP ${resp.status}` };
      return { ok: true, message: "Vonage credentials verified" };
    }

    if (provider === "openai") {
      const apiKey = credentials.apiKey;
      if (!apiKey) return { ok: false, message: "Missing apiKey" };

      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return { ok: false, message: `OpenAI API returned HTTP ${resp.status}` };
      return { ok: true, message: "OpenAI credentials verified" };
    }

    if (provider === "deepgram") {
      const apiKey = credentials.apiKey;
      if (!apiKey) return { ok: false, message: "Missing apiKey" };

      const resp = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: `Token ${apiKey}` },
      });
      if (!resp.ok) return { ok: false, message: `Deepgram API returned HTTP ${resp.status}` };
      return { ok: true, message: "Deepgram credentials verified" };
    }

    // Storage and DB providers — skip live verification, just validate fields
    if (provider === "s3") {
      if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.bucket)
        return { ok: false, message: "Missing accessKeyId, secretAccessKey, or bucket" };
      return { ok: true, message: "S3 credentials accepted (no live verification)" };
    }

    if (provider === "r2") {
      if (!credentials.accountId || !credentials.accessKeyId || !credentials.secretAccessKey || !credentials.bucket)
        return { ok: false, message: "Missing accountId, accessKeyId, secretAccessKey, or bucket" };
      return { ok: true, message: "R2 credentials accepted (no live verification)" };
    }

    if (provider === "turso") {
      if (!credentials.databaseUrl || !credentials.authToken)
        return { ok: false, message: "Missing databaseUrl or authToken" };
      return { ok: true, message: "Turso credentials accepted (no live verification)" };
    }

    if (provider === "convex") {
      if (!credentials.deploymentUrl || !credentials.adminKey)
        return { ok: false, message: "Missing deploymentUrl or adminKey" };
      return { ok: true, message: "Convex credentials accepted (no live verification)" };
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
    "Register and verify third-party provider credentials (Twilio, Resend, ElevenLabs). Saves to .env file.",
    {
      provider: z.enum(["twilio", "vonage", "resend", "elevenlabs", "openai", "deepgram", "s3", "r2", "turso", "convex"]).describe("Provider name"),
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
