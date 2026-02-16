/**
 * comms_provision_channels — MCP tool for provisioning a new agent with channels.
 * Buys a phone number, assigns WhatsApp from pool, generates email, updates DB.
 * Rolls back on failure (releases number, returns pool slot).
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { searchAndBuyNumber, configureNumberWebhooks, releasePhoneNumber } from "../provisioning/phone-number.js";
import { assignFromPool, returnToPool } from "../provisioning/whatsapp-sender.js";
import { generateEmailAddress } from "../provisioning/email-identity.js";
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

export function registerProvisionChannelsTool(server: McpServer): void {
  server.tool(
    "comms_provision_channels",
    "Provision a new agent with communication channels (phone, WhatsApp, email, voice AI). Buys a phone number, assigns WhatsApp from pool, generates email address, and registers the agent.",
    {
      agentId: z.string().describe("Unique agent identifier"),
      displayName: z.string().describe("Human-readable agent name"),
      greeting: z.string().optional().describe("Greeting message for voice calls"),
      systemPrompt: z.string().optional().describe("System prompt for AI voice conversations"),
      country: z.string().default("US").describe("Country code for phone number (default: US)"),
      capabilities: z.object({
        phone: z.boolean().default(false).describe("Buy a phone number for SMS"),
        whatsapp: z.boolean().default(false).describe("Assign a WhatsApp sender from pool"),
        email: z.boolean().default(false).describe("Generate an email address"),
        voiceAi: z.boolean().default(false).describe("Enable voice AI (uses phone number)"),
      }).describe("Which channels to provision"),
      emailDomain: z.string().optional().describe("Email domain (falls back to config default)"),
      providerOverrides: z.record(z.string()).optional().describe("Per-provider config overrides"),
      routeDuplication: z.record(z.string()).optional().describe("Route duplication config"),
    },
    async ({ agentId, displayName, greeting, systemPrompt, country, capabilities, emailDomain, providerOverrides, routeDuplication }, extra) => {
      // Auth: only admin can provision
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
              error: `Provisioning requires identityMode="dedicated" and isolationMode="single-account". Current: identityMode="${config.identityMode}", isolationMode="${config.isolationMode}". Other modes are not yet implemented.`,
            }),
          }],
          isError: true,
        };
      }

      const db = getProvider("database");

      // 1. Check agent doesn't already exist
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

      // 2. Check pool capacity
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
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent pool is full (${pool.active_agents}/${pool.max_agents}). Deprovision an agent first.` }) }],
          isError: true,
        };
      }

      // 3. Track allocated resources for rollback
      let boughtNumber: { phoneNumber: string; sid: string } | null = null;
      let assignedWhatsApp = false;
      let agentInserted = false;
      let phoneNumber: string | null = null;
      let whatsappSenderSid: string | null = null;
      let whatsappNumber: string | null = null;
      let emailAddress: string | null = null;
      let whatsappStatus = "inactive";

      try {
        // 4. Phone number
        if (capabilities.phone || capabilities.voiceAi) {
          boughtNumber = await searchAndBuyNumber(country, { voice: true, sms: true });
          phoneNumber = boughtNumber.phoneNumber;
          await configureNumberWebhooks(phoneNumber, agentId, config.webhookBaseUrl);
        }

        // 5. Email
        if (capabilities.email) {
          const domain = emailDomain || config.emailDefaultDomain;
          emailAddress = generateEmailAddress(agentId, domain);
        }

        // 6. Insert agent row first (needed before WhatsApp pool FK)
        const channelId = randomUUID();
        db.run(
          `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, system_prompt, greeting, provider_overrides, route_duplication, status, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
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
            providerOverrides ? JSON.stringify(providerOverrides) : null,
            routeDuplication ? JSON.stringify(routeDuplication) : null,
            orgId,
          ]
        );
        agentInserted = true;

        // 7. WhatsApp (after agent row exists for FK)
        if (capabilities.whatsapp) {
          const waResult = assignFromPool(db, agentId);
          if (waResult) {
            assignedWhatsApp = true;
            whatsappNumber = waResult.phoneNumber;
            whatsappSenderSid = waResult.senderSid || waResult.phoneNumber;
            whatsappStatus = "active";
            // Update the agent row with WhatsApp info
            db.run(
              "UPDATE agent_channels SET whatsapp_sender_sid = ?, whatsapp_status = ? WHERE agent_id = ?",
              [whatsappSenderSid, whatsappStatus, agentId]
            );
          } else {
            // Soft fail — pool empty, but continue
            whatsappStatus = "unavailable";
            db.run(
              "UPDATE agent_channels SET whatsapp_status = ? WHERE agent_id = ?",
              [whatsappStatus, agentId]
            );
          }
        }

        // 8. Update agent pool
        db.run(
          "UPDATE agent_pool SET active_agents = active_agents + 1, updated_at = datetime('now') WHERE id = 'default'"
        );

        const updatedPool = db.query<PoolRow>(
          "SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'"
        );
        const slotsRemaining = updatedPool[0] ? updatedPool[0].max_agents - updatedPool[0].active_agents : 0;

        // 9. Generate security token for this agent
        const { plainToken, tokenHash } = generateToken();
        storeToken(db, agentId, tokenHash, `provisioned-${displayName}`, orgId);

        // 10. Create default spending limits row
        const limitsId = randomUUID();
        db.run(
          `INSERT OR IGNORE INTO spending_limits (id, agent_id, org_id) VALUES (?, ?, ?)`,
          [limitsId, agentId, orgId]
        );

        appendAuditLog(db, {
          eventType: "agent_provisioned",
          actor: "admin",
          target: agentId,
          details: { displayName, phoneNumber, emailAddress, whatsappStatus },
        });

        logger.info("agent_provisioned", { agentId, displayName, phoneNumber, emailAddress, whatsappStatus });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
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
            }, null, 2),
          }],
        };
      } catch (err) {
        // Rollback: release bought number
        if (boughtNumber) {
          try {
            await releasePhoneNumber(boughtNumber.phoneNumber);
          } catch (rollbackErr) {
            logger.error("provisioning_rollback_release_failed", {
              phoneNumber: boughtNumber.phoneNumber,
              error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
            });
          }
        }

        // Rollback: return WhatsApp to pool
        if (assignedWhatsApp) {
          try {
            returnToPool(db, agentId);
          } catch (rollbackErr) {
            logger.error("provisioning_rollback_whatsapp_failed", {
              agentId,
              error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
            });
          }
        }

        // Rollback: revoke any issued tokens
        try {
          revokeAgentTokens(db, agentId);
        } catch (rollbackErr) {
          logger.error("provisioning_rollback_token_revoke_failed", {
            agentId,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }

        // Rollback: remove spending limits row
        try {
          db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]);
        } catch (rollbackErr) {
          logger.error("provisioning_rollback_spending_limits_failed", {
            agentId,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }

        // Rollback: remove agent row if inserted
        if (agentInserted) {
          try {
            db.run("DELETE FROM agent_channels WHERE agent_id = ?", [agentId]);
          } catch (rollbackErr) {
            logger.error("provisioning_rollback_agent_delete_failed", {
              agentId,
              error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
            });
          }
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("provisioning_failed", { agentId, error: errMsg });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Provisioning failed: ${errMsg}` }) }],
          isError: true,
        };
      }
    }
  );

  logger.info("tool_registered", { name: "comms_provision_channels" });
}
