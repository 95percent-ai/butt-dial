/**
 * comms_onboard_customer — unified admin tool for full customer onboarding.
 * Provisions all channels, generates email DNS records, returns setup package.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { searchAndBuyNumber, configureNumberWebhooks, releasePhoneNumber } from "../provisioning/phone-number.js";
import { assignFromPool, returnToPool } from "../provisioning/whatsapp-sender.js";
import { generateEmailAddress, requestDomainVerification } from "../provisioning/email-identity.js";
import { requireAdmin, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { generateToken, storeToken, revokeAgentTokens } from "../security/token-manager.js";
import { appendAuditLog } from "../observability/audit-log.js";

interface PoolRow {
  max_agents: number;
  active_agents: number;
}

interface AgentRow {
  agent_id: string;
}

export function registerOnboardCustomerTool(server: McpServer): void {
  server.tool(
    "comms_onboard_customer",
    "Full customer onboarding: provisions all channels (phone, WhatsApp, email, voice AI), generates email DNS records, and returns a complete setup package with security token, channels, DNS records, webhook URLs, and SSE connection instructions.",
    {
      agentId: z.string().optional().describe("Agent identifier (auto-generated UUID if omitted)"),
      displayName: z.string().describe("Human-readable agent name"),
      capabilities: z.object({
        phone: z.boolean().default(true).describe("Buy a phone number for SMS"),
        whatsapp: z.boolean().default(true).describe("Assign a WhatsApp sender from pool"),
        email: z.boolean().default(true).describe("Generate an email address"),
        voiceAi: z.boolean().default(true).describe("Enable voice AI (uses phone number)"),
      }).describe("Which channels to provision (all default to true)"),
      emailDomain: z.string().optional().describe("Email domain (falls back to config default)"),
      greeting: z.string().optional().describe("Greeting message for voice calls"),
      systemPrompt: z.string().optional().describe("System prompt for AI voice conversations"),
      country: z.string().default("US").describe("Country code for phone number (default: US)"),
    },
    async ({ agentId: explicitAgentId, displayName, capabilities, emailDomain, greeting, systemPrompt, country }, extra) => {
      // Auto-generate agentId if not provided
      const agentId = explicitAgentId || randomUUID();
      // Auth: only admin can onboard
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);

      // Guard: only dedicated + single-account mode is implemented
      if (config.identityMode !== "dedicated" || config.isolationMode !== "single-account") {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `Onboarding requires identityMode="dedicated" and isolationMode="single-account". Current: identityMode="${config.identityMode}", isolationMode="${config.isolationMode}".`,
            }),
          }],
          isError: true,
        };
      }

      const db = getProvider("database");

      // Check agent doesn't already exist
      const existing = db.query<AgentRow>(
        "SELECT agent_id FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (existing.length > 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" already exists` }) }],
          isError: true,
        };
      }

      // Check pool capacity
      const poolRows = db.query<PoolRow>(
        "SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'"
      );
      const pool = poolRows[0];

      if (!pool) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Agent pool not initialized" }) }],
          isError: true,
        };
      }

      if (pool.active_agents >= pool.max_agents) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent pool is full (${pool.active_agents}/${pool.max_agents}).` }) }],
          isError: true,
        };
      }

      // Track allocated resources for rollback
      let boughtNumber: { phoneNumber: string; sid: string } | null = null;
      let assignedWhatsApp = false;
      let agentInserted = false;
      let phoneNumber: string | null = null;
      let whatsappSenderSid: string | null = null;
      let whatsappNumber: string | null = null;
      let emailAddress: string | null = null;
      let whatsappStatus = "inactive";

      try {
        // Phone number
        if (capabilities.phone || capabilities.voiceAi) {
          boughtNumber = await searchAndBuyNumber(country, { voice: true, sms: true });
          phoneNumber = boughtNumber.phoneNumber;
          await configureNumberWebhooks(phoneNumber, agentId, config.webhookBaseUrl);
        }

        // Email
        const domain = emailDomain || config.emailDefaultDomain;
        if (capabilities.email) {
          emailAddress = generateEmailAddress(agentId, domain);
        }

        // Insert agent row
        const channelId = randomUUID();
        db.run(
          `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, system_prompt, greeting, status, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
          [
            channelId,
            agentId,
            displayName,
            phoneNumber,
            null,
            whatsappStatus,
            emailAddress,
            capabilities.voiceAi ? "default" : null,
            systemPrompt || null,
            greeting || null,
            orgId,
          ]
        );
        agentInserted = true;

        // WhatsApp (after agent row exists for FK)
        if (capabilities.whatsapp) {
          const waResult = assignFromPool(db, agentId);
          if (waResult) {
            assignedWhatsApp = true;
            whatsappNumber = waResult.phoneNumber;
            whatsappSenderSid = waResult.senderSid || waResult.phoneNumber;
            whatsappStatus = "active";
            db.run(
              "UPDATE agent_channels SET whatsapp_sender_sid = ?, whatsapp_status = ? WHERE agent_id = ?",
              [whatsappSenderSid, whatsappStatus, agentId]
            );
          } else {
            whatsappStatus = "unavailable";
            db.run(
              "UPDATE agent_channels SET whatsapp_status = ? WHERE agent_id = ?",
              [whatsappStatus, agentId]
            );
          }
        }

        // Update agent pool
        db.run(
          "UPDATE agent_pool SET active_agents = active_agents + 1, updated_at = datetime('now') WHERE id = 'default'"
        );

        const updatedPool = db.query<PoolRow>(
          "SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'"
        );
        const slotsRemaining = updatedPool[0] ? updatedPool[0].max_agents - updatedPool[0].active_agents : 0;

        // Generate security token
        const { plainToken, tokenHash } = generateToken();
        storeToken(db, agentId, tokenHash, `onboarded-${displayName}`, orgId);

        // Create default spending limits row
        const limitsId = randomUUID();
        db.run(
          `INSERT OR IGNORE INTO spending_limits (id, agent_id, org_id) VALUES (?, ?, ?)`,
          [limitsId, agentId, orgId]
        );

        // Email DNS records (if email is enabled)
        let emailSetup: { domain: string; records: Array<{ type: string; name: string; value: string }> } | null = null;
        if (capabilities.email) {
          try {
            const dnsResult = await requestDomainVerification(domain);
            emailSetup = { domain, records: dnsResult.records };
          } catch (err) {
            // Soft fail — DNS records may not be available in mock/dev mode
            emailSetup = { domain, records: [] };
            logger.warn("onboarding_dns_records_unavailable", {
              agentId,
              domain,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        appendAuditLog(db, {
          eventType: "customer_onboarded",
          actor: "admin",
          target: agentId,
          details: { displayName, phoneNumber, emailAddress, whatsappStatus },
        });

        logger.info("customer_onboarded", { agentId, displayName, phoneNumber, emailAddress, whatsappStatus });

        // Build complete setup package
        const baseUrl = config.webhookBaseUrl;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              provisioning: {
                agentId,
                displayName,
                securityToken: plainToken,
                channels: {
                  phone: phoneNumber ? { number: phoneNumber, status: "active" } : null,
                  whatsapp: capabilities.whatsapp ? { number: whatsappNumber, senderSid: whatsappSenderSid, status: whatsappStatus } : null,
                  email: emailAddress ? { address: emailAddress, status: "active" } : null,
                  voiceAi: capabilities.voiceAi ? { status: "active", usesPhoneNumber: phoneNumber } : null,
                },
                pool: { slotsRemaining },
              },
              emailSetup,
              webhookUrls: {
                sms: phoneNumber ? `${baseUrl}/webhooks/${agentId}/sms` : null,
                whatsapp: capabilities.whatsapp ? `${baseUrl}/webhooks/${agentId}/whatsapp` : null,
                email: capabilities.email ? `${baseUrl}/webhooks/${agentId}/email` : null,
                voice: capabilities.voiceAi ? `${baseUrl}/webhooks/${agentId}/voice` : null,
                voiceWs: capabilities.voiceAi ? `${baseUrl.replace("http", "ws")}/webhooks/${agentId}/voice-ws` : null,
              },
              connectionInstructions: {
                sseEndpoint: `${baseUrl}/sse?token=${plainToken}`,
                messagesEndpoint: `${baseUrl}/messages`,
                authHeader: `Bearer ${plainToken}`,
                steps: [
                  `1. Connect to SSE: GET ${baseUrl}/sse?token=${plainToken}`,
                  `2. Send tool calls: POST ${baseUrl}/messages?sessionId=<from-sse> with Authorization: Bearer ${plainToken}`,
                  "3. Available tools: comms_send_message, comms_get_waiting_messages, comms_make_call, comms_send_voice_message, comms_get_channel_status, comms_get_usage_dashboard",
                ],
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        // Rollback
        if (boughtNumber) {
          try { await releasePhoneNumber(boughtNumber.phoneNumber); } catch {}
        }
        if (assignedWhatsApp) {
          try { returnToPool(db, agentId); } catch {}
        }
        try { revokeAgentTokens(db, agentId); } catch {}
        try { db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]); } catch {}
        if (agentInserted) {
          try { db.run("DELETE FROM agent_channels WHERE agent_id = ?", [agentId]); } catch {}
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("onboarding_failed", { agentId, error: errMsg });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Onboarding failed: ${errMsg}` }) }],
          isError: true,
        };
      }
    }
  );

  logger.info("tool_registered", { name: "comms_onboard_customer" });
}
