/**
 * Sandbox Responder — generates realistic reply messages for sandbox orgs.
 *
 * After a sandbox send, waits a configurable delay, then generates a realistic
 * reply using the LLM adapter. The reply appears as an inbound message
 * (stored in messages table).
 *
 * Fire-and-forget — doesn't slow down the send response.
 * Only fires when: org is sandbox + LLM adapter available + feature enabled.
 */

import { randomUUID } from "crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { isLlmAvailable, complete } from "./llm-adapter.js";
import { getProvider } from "../providers/factory.js";

/** Generate a realistic Twilio-style message ID */
function realisticMessageId(channel: string): string {
  const hex = randomUUID().replace(/-/g, "");
  switch (channel) {
    case "sms": return `SM${hex}`;
    case "whatsapp": return `WA${hex}`;
    case "email": return `EM${hex}`;
    case "line": return `LN${hex}`;
    default: return `SB${hex}`;
  }
}

/**
 * Check if sandbox reply should fire for this org, then trigger it.
 * Call this after a successful mock send. Fire-and-forget.
 */
export function maybeTriggerSandboxReply(params: {
  orgId: string;
  agentId: string;
  channel: string;
  to: string;
  from: string;
  body: string;
}): void {
  if (!config.sandboxLlmEnabled) return;
  if (!isLlmAvailable()) return;

  // Check if the org is in sandbox mode
  try {
    const db = getProvider("database");
    const orgs = db.query<{ mode: string }>(
      "SELECT mode FROM organizations WHERE id = ?",
      [params.orgId],
    );
    // Only sandbox orgs get auto-replies
    if (orgs.length === 0 || orgs[0].mode !== "sandbox") return;
  } catch {
    return;
  }

  // Fire-and-forget — don't await
  const delay = config.sandboxReplyDelayMs;
  setTimeout(() => {
    generateAndStoreReply(params).catch((err) => {
      logger.warn("sandbox_reply_failed", { error: String(err), agentId: params.agentId });
    });
  }, delay);
}

async function generateAndStoreReply(params: {
  orgId: string;
  agentId: string;
  channel: string;
  to: string;
  from: string;
  body: string;
}): Promise<void> {
  const channelLabel = params.channel === "email" ? "email" : params.channel === "whatsapp" ? "WhatsApp" : params.channel === "line" ? "LINE" : "SMS";

  const system = `You're a person who received a ${channelLabel} message. Reply naturally and briefly (1-2 sentences). Don't mention you're an AI. Act like a real human recipient.`;
  const user = `You received this message:\n\n"${params.body}"\n\nReply as the recipient would:`;

  const result = await complete(system, user, 100);
  if (!result) return;

  const db = getProvider("database");
  const messageId = randomUUID();
  const externalId = realisticMessageId(params.channel);

  // Store as inbound message (swap to/from for the reply direction)
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, cost, org_id)
     VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, 'received', 0, ?)`,
    [messageId, params.agentId, params.channel, params.to, params.from, result.text, externalId, params.orgId],
  );

  logger.info("sandbox_reply_generated", {
    agentId: params.agentId,
    channel: params.channel,
    replyLength: result.text.length,
    provider: result.provider,
    externalId,
  });
}
