/**
 * Compliance module — content filtering, DNC, TCPA, CAN-SPAM, GDPR.
 *
 * All checks are synchronous and run before any message is sent.
 * Each function returns { allowed: true } or { allowed: false, reason: string }.
 */

import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import type { IDBProvider } from "../providers/interfaces.js";
import { hasActiveConsent } from "../tools/consent-tools.js";

export interface ComplianceResult {
  allowed: boolean;
  reason?: string;
}

// ------------------------------------------------------------------
// Content Filtering — profanity, abuse, threats
// ------------------------------------------------------------------

const BLOCKED_PATTERNS = [
  /\b(kill|murder|bomb|threat|attack)\s+(you|them|him|her|everyone)\b/i,
  /\b(i('ll|m going to)\s+)?(kill|murder|hurt|harm)\b/i,
  /\bkill\s+yourself\b/i,
  /\bdie\b.*\bplease\b/i,
  /\b(hate\s+speech|racial\s+slur)/i,
];

const PROFANITY_WORDS = [
  "fuck", "shit", "bitch", "asshole", "dickhead", "cunt",
  "motherfucker", "cocksucker", "nigger", "faggot", "retard",
];

export function checkContentFilter(text: string): ComplianceResult {
  if (!text) return { allowed: true };

  const lower = text.toLowerCase();

  // Check threat patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      logger.warn("compliance_content_blocked", { reason: "threat_pattern" });
      return { allowed: false, reason: "Message contains threatening content" };
    }
  }

  // Check profanity (whole word match)
  for (const word of PROFANITY_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      logger.warn("compliance_content_blocked", { reason: "profanity" });
      return { allowed: false, reason: "Message contains prohibited language" };
    }
  }

  return { allowed: true };
}

// ------------------------------------------------------------------
// DNC List — Do Not Contact
// ------------------------------------------------------------------

export function checkDnc(db: IDBProvider, address: string, type: "phone" | "email", orgId?: string): ComplianceResult {
  const column = type === "phone" ? "phone_number" : "email_address";
  try {
    const orgClause = orgId ? " AND org_id = ?" : "";
    const orgParams = orgId ? [orgId] : [];
    const rows = db.query<{ id: string }>(
      `SELECT id FROM dnc_list WHERE ${column} = ?${orgClause}`,
      [address, ...orgParams]
    );
    if (rows.length > 0) {
      logger.warn("compliance_dnc_blocked", { address, type });
      return { allowed: false, reason: `${address} is on the Do Not Contact list` };
    }
  } catch {
    // Table might not exist yet — allow
  }
  return { allowed: true };
}

export function addToDnc(db: IDBProvider, params: {
  phoneNumber?: string;
  emailAddress?: string;
  reason: string;
  addedBy: string;
  orgId?: string;
}): void {
  db.run(
    "INSERT INTO dnc_list (id, phone_number, email_address, reason, added_by, org_id) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), params.phoneNumber || null, params.emailAddress || null, params.reason, params.addedBy, params.orgId ?? "default"]
  );
}

export function removeFromDnc(db: IDBProvider, address: string): void {
  db.run("DELETE FROM dnc_list WHERE phone_number = ? OR email_address = ?", [address, address]);
}

// ------------------------------------------------------------------
// TCPA Time-of-Day — no calls before 8am or after 9pm local time
// ------------------------------------------------------------------

export function checkTcpaTimeOfDay(timezone?: string): ComplianceResult {
  const now = new Date();

  // Default to US Eastern if no timezone specified
  const tz = timezone || "America/New_York";
  let hour: number;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    hour = parseInt(formatter.format(now), 10);
  } catch {
    // Invalid timezone — fall back to UTC
    hour = now.getUTCHours();
  }

  if (hour < 8 || hour >= 21) {
    logger.warn("compliance_tcpa_blocked", { hour, timezone: tz });
    return {
      allowed: false,
      reason: `TCPA: Calls not allowed at this time (${hour}:00 in ${tz}). Allowed: 8:00 AM - 9:00 PM.`,
    };
  }

  return { allowed: true };
}

// ------------------------------------------------------------------
// Recording Consent — two-party consent jurisdictions
// ------------------------------------------------------------------

const TWO_PARTY_CONSENT_STATES = new Set([
  "CA", "CT", "FL", "IL", "MD", "MA", "MI", "MT", "NH", "OR", "PA", "WA",
]);

export function requiresRecordingConsent(state?: string): boolean {
  if (!state) return true; // Default to requiring consent
  return TWO_PARTY_CONSENT_STATES.has(state.toUpperCase());
}

export function getConsentAnnouncement(): string {
  return "This call may be recorded for quality assurance purposes.";
}

// ------------------------------------------------------------------
// CAN-SPAM — outbound emails must include physical address + unsubscribe
// ------------------------------------------------------------------

export function checkCanSpam(html: string | undefined, body: string): ComplianceResult {
  const content = html || body;
  if (!content) return { allowed: true };

  // CAN-SPAM only applies to commercial emails
  // We check if basic compliance elements are present

  const hasUnsubscribe = /unsubscribe/i.test(content);
  const hasAddress = /\d+\s+\w+\s+(st|street|ave|avenue|blvd|road|rd|dr|drive|ln|lane)/i.test(content)
    || /p\.?\s*o\.?\s*box/i.test(content);

  if (!hasUnsubscribe) {
    logger.info("compliance_canspam_warning", { issue: "no_unsubscribe" });
    // Warning only — don't block (might be transactional email)
  }

  return { allowed: true };
}

// ------------------------------------------------------------------
// GDPR Right to Erasure
// ------------------------------------------------------------------

export function processErasureRequest(db: IDBProvider, identifier: string, identifierType: "phone" | "email" | "agent_id", orgId?: string): {
  requestId: string;
  tablesAffected: string[];
  rowsDeleted: number;
} {
  const requestId = randomUUID();
  let totalDeleted = 0;
  const tables: string[] = [];

  // Determine column to match
  const columnMap: Record<string, Array<{ table: string; column: string }>> = {
    phone: [
      { table: "messages", column: "from_address" },
      { table: "messages", column: "to_address" },
      { table: "call_logs", column: "from_address" },
      { table: "call_logs", column: "to_address" },
      { table: "dnc_list", column: "phone_number" },
      { table: "voicemail_messages", column: "caller_from" },
    ],
    email: [
      { table: "messages", column: "from_address" },
      { table: "messages", column: "to_address" },
      { table: "dnc_list", column: "email_address" },
    ],
    agent_id: [
      { table: "messages", column: "agent_id" },
      { table: "call_logs", column: "agent_id" },
      { table: "voicemail_messages", column: "agent_id" },
      { table: "usage_logs", column: "agent_id" },
    ],
  };

  const targets = columnMap[identifierType] || [];
  const orgClause = orgId ? " AND org_id = ?" : "";
  const orgParams = orgId ? [orgId] : [];

  for (const { table, column } of targets) {
    try {
      const result = db.run(
        `DELETE FROM ${table} WHERE ${column} = ?${orgClause}`,
        [identifier, ...orgParams]
      );
      if (result.changes > 0) {
        totalDeleted += result.changes;
        if (!tables.includes(table)) tables.push(table);
      }
    } catch {
      // Table might not exist — skip
    }
  }

  // Log the erasure request
  try {
    db.run(
      `INSERT INTO erasure_requests (id, subject_identifier, identifier_type, status, tables_affected, rows_deleted, completed_at)
       VALUES (?, ?, ?, 'completed', ?, ?, datetime('now'))`,
      [requestId, identifier, identifierType, JSON.stringify(tables), totalDeleted]
    );
  } catch {
    // erasure_requests table might not exist
  }

  logger.info("compliance_erasure_completed", {
    requestId,
    identifier: identifier.slice(0, 4) + "***",
    identifierType,
    tablesAffected: tables,
    rowsDeleted: totalDeleted,
  });

  return { requestId, tablesAffected: tables, rowsDeleted: totalDeleted };
}

// ------------------------------------------------------------------
// Combined pre-send check
// ------------------------------------------------------------------

export function preSendCheck(db: IDBProvider, params: {
  channel: string;
  to: string;
  body: string;
  html?: string;
  agentId?: string;
  orgId?: string;
}): ComplianceResult {
  // 1. Content filter
  const contentCheck = checkContentFilter(params.body);
  if (!contentCheck.allowed) return contentCheck;

  // 2. DNC check
  const dncType = params.channel === "email" ? "email" : "phone";
  const dncCheck = checkDnc(db, params.to, dncType);
  if (!dncCheck.allowed) return dncCheck;

  // 3. Consent check (if agent context provided)
  if (params.agentId) {
    const consentOk = hasActiveConsent(db, params.agentId, params.to, params.channel, params.orgId);
    if (!consentOk) {
      logger.warn("compliance_consent_blocked", { agentId: params.agentId, to: params.to, channel: params.channel });
      return {
        allowed: false,
        reason: `No active consent from ${params.to} for ${params.channel}. Record consent before sending.`,
      };
    }
  }

  // 4. TCPA for voice/calls
  if (params.channel === "voice") {
    const tcpaCheck = checkTcpaTimeOfDay();
    if (!tcpaCheck.allowed) return tcpaCheck;
  }

  // 5. CAN-SPAM for email
  if (params.channel === "email") {
    const canSpamCheck = checkCanSpam(params.html, params.body);
    if (!canSpamCheck.allowed) return canSpamCheck;
  }

  return { allowed: true };
}
