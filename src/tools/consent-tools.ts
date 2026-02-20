/**
 * Consent tracking MCP tools.
 * comms_record_consent — record that a contact gave consent
 * comms_revoke_consent — record that a contact revoked consent
 * comms_check_consent — check current consent status for a contact
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { appendAuditLog } from "../observability/audit-log.js";
import type { IDBProvider } from "../providers/interfaces.js";

interface ConsentRow {
  id: string;
  agent_id: string;
  contact_address: string;
  channel: string;
  consent_type: string;
  status: string;
  granted_at: string | null;
  revoked_at: string | null;
  source: string | null;
  notes: string | null;
}

export function registerConsentTools(server: McpServer): void {
  // ── Record Consent ─────────────────────────────────────────────
  server.tool(
    "comms_record_consent",
    "Record that a contact has given consent to be contacted on a specific channel. Required before outbound communications in most jurisdictions.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      contactAddress: z.string().describe("Phone number or email of the contact"),
      channel: z.enum(["sms", "voice", "email", "whatsapp"]).describe("Communication channel"),
      consentType: z.enum(["express", "implied", "transactional"]).default("express").describe("Type of consent obtained"),
      source: z.string().optional().describe("How consent was obtained (web_form, verbal, sms_optin, api)"),
      notes: z.string().optional().describe("Additional context about the consent"),
    },
    async ({ agentId: explicitAgentId, contactAddress, channel, consentType, source, notes }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      const db = getProvider("database");

      // Upsert: if existing revoked consent, update to granted
      const existing = db.query<ConsentRow>(
        "SELECT id, status FROM contact_consent WHERE agent_id = ? AND contact_address = ? AND channel = ? AND org_id = ?",
        [agentId, contactAddress, channel, orgId]
      );

      let consentId: string;
      if (existing.length > 0) {
        consentId = existing[0].id;
        db.run(
          "UPDATE contact_consent SET status = 'granted', consent_type = ?, granted_at = datetime('now'), revoked_at = NULL, source = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
          [consentType, source || null, notes || null, consentId]
        );
      } else {
        consentId = randomUUID();
        db.run(
          `INSERT INTO contact_consent (id, agent_id, org_id, contact_address, channel, consent_type, status, source, notes)
           VALUES (?, ?, ?, ?, ?, ?, 'granted', ?, ?)`,
          [consentId, agentId, orgId, contactAddress, channel, consentType, source || null, notes || null]
        );
      }

      appendAuditLog(db, {
        eventType: "consent_recorded",
        actor: `agent:${agentId}`,
        target: contactAddress,
        details: { channel, consentType, source },
        orgId,
      });

      logger.info("consent_recorded", { agentId, contactAddress: contactAddress.slice(0, 4) + "***", channel });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, consentId, status: "granted" }),
        }],
      };
    }
  );

  // ── Revoke Consent ─────────────────────────────────────────────
  server.tool(
    "comms_revoke_consent",
    "Record that a contact has revoked consent to be contacted on a specific channel. No further outbound communications will be allowed on this channel.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      contactAddress: z.string().describe("Phone number or email of the contact"),
      channel: z.enum(["sms", "voice", "email", "whatsapp"]).describe("Communication channel"),
    },
    async ({ agentId: explicitAgentId, contactAddress, channel }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      const db = getProvider("database");

      const result = db.run(
        "UPDATE contact_consent SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now') WHERE agent_id = ? AND contact_address = ? AND channel = ? AND org_id = ? AND status = 'granted'",
        [agentId, contactAddress, channel, orgId]
      );

      if (result.changes === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: true, message: "No active consent found to revoke" }),
          }],
        };
      }

      appendAuditLog(db, {
        eventType: "consent_revoked",
        actor: `agent:${agentId}`,
        target: contactAddress,
        details: { channel },
        orgId,
      });

      logger.info("consent_revoked", { agentId, contactAddress: contactAddress.slice(0, 4) + "***", channel });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, status: "revoked" }),
        }],
      };
    }
  );

  // ── Check Consent ──────────────────────────────────────────────
  server.tool(
    "comms_check_consent",
    "Check whether a contact has granted consent to be contacted on a specific channel.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      contactAddress: z.string().describe("Phone number or email of the contact"),
      channel: z.enum(["sms", "voice", "email", "whatsapp"]).describe("Communication channel"),
    },
    async ({ agentId: explicitAgentId, contactAddress, channel }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      const db = getProvider("database");

      const rows = db.query<ConsentRow>(
        "SELECT * FROM contact_consent WHERE agent_id = ? AND contact_address = ? AND channel = ? AND org_id = ? ORDER BY updated_at DESC LIMIT 1",
        [agentId, contactAddress, channel, orgId]
      );

      if (rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ hasConsent: false, status: "none", message: "No consent record found" }),
          }],
        };
      }

      const consent = rows[0];
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            hasConsent: consent.status === "granted",
            status: consent.status,
            consentType: consent.consent_type,
            grantedAt: consent.granted_at,
            revokedAt: consent.revoked_at,
            source: consent.source,
          }),
        }],
      };
    }
  );
}

/**
 * Check if a contact has active consent for a channel.
 * Used by preSendCheck() in compliance.ts.
 */
export function hasActiveConsent(
  db: IDBProvider,
  agentId: string,
  contactAddress: string,
  channel: string,
  orgId: string = "default"
): boolean {
  try {
    const rows = db.query<{ status: string }>(
      "SELECT status FROM contact_consent WHERE agent_id = ? AND contact_address = ? AND channel = ? AND org_id = ? AND status = 'granted'",
      [agentId, contactAddress, channel, orgId]
    );
    return rows.length > 0;
  } catch {
    // Table might not exist — allow (don't block on missing table)
    return true;
  }
}

/**
 * Revoke consent by contact address (used by STOP keyword handler).
 */
export function revokeConsentByAddress(
  db: IDBProvider,
  contactAddress: string,
  channel: string,
  orgId?: string
): number {
  try {
    const orgClause = orgId ? " AND org_id = ?" : "";
    const orgParams = orgId ? [orgId] : [];
    const result = db.run(
      `UPDATE contact_consent SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now') WHERE contact_address = ? AND channel = ? AND status = 'granted'${orgClause}`,
      [contactAddress, channel, ...orgParams]
    );
    return result.changes;
  } catch {
    return 0;
  }
}
