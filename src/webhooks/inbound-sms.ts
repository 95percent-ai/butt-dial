/**
 * Inbound SMS webhook handler.
 *
 * Twilio POSTs here when someone texts an agent's phone number.
 * Flow: parse body → find agent → forward to callback → queue dead letter on failure → return TwiML.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { revokeConsentByAddress } from "../tools/consent-tools.js";
import { addToDnc } from "../security/compliance.js";
import { isChannelBlocked } from "../lib/channel-blocker.js";
import { getAgentGender } from "../lib/gender-context.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
  blocked_channels: string | null;
}

interface TwilioSmsBody {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

export async function handleInboundSms(req: Request, res: Response): Promise<void> {
  const { agentId } = req.params;
  const body = req.body as TwilioSmsBody;

  logger.info("inbound_sms_received", {
    agentId,
    from: body.From,
    to: body.To,
    messageSid: body.MessageSid,
  });

  // Validate required fields
  if (!body.From || !body.To) {
    logger.warn("inbound_sms_missing_fields", { agentId, body });
    res.status(400).send("<Response/>");
    return;
  }

  const db = getProvider("database");

  // Look up agent by matching the To phone number
  const rows = db.query<AgentRow>(
    "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ? AND phone_number = ?",
    [agentId, body.To]
  );

  if (rows.length === 0) {
    logger.warn("inbound_sms_agent_not_found", { agentId, to: body.To });
    res.status(404).send("<Response/>");
    return;
  }

  const agent = rows[0];

  if (agent.status !== "active") {
    logger.warn("inbound_sms_agent_inactive", { agentId, status: agent.status });
    res.status(200).send("<Response/>");
    return;
  }

  if (isChannelBlocked(agent.blocked_channels, "sms")) {
    logger.warn("inbound_sms_channel_blocked", { agentId });
    res.status(200).send("<Response/>");
    return;
  }

  // Look up org_id for multi-tenant scoping
  let orgId = "default";
  try {
    const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
  } catch {}

  // STOP keyword processing — revoke consent and add to DNC
  const smsBody = (body.Body || "").trim();
  const STOP_KEYWORDS = ["stop", "unsubscribe", "cancel", "end", "quit"];
  if (STOP_KEYWORDS.includes(smsBody.toLowerCase())) {
    logger.info("inbound_sms_stop_keyword", { agentId, from: body.From });

    // Revoke all consent for this sender
    const revoked = revokeConsentByAddress(db, body.From, "sms", orgId);

    // Add to DNC list
    addToDnc(db, {
      phoneNumber: body.From,
      reason: `STOP keyword received via SMS`,
      addedBy: `system:inbound-sms:${agentId}`,
      orgId,
    });

    // Return confirmation TwiML
    res.status(200).type("text/xml").send(
      `<Response><Message>You have been unsubscribed and will no longer receive messages. Reply START to re-subscribe.</Message></Response>`
    );
    return;
  }

  // Forward to callback URL — queue to dead_letters on failure
  const callbackUrl = config.agentosCallbackUrl.replace(
    "{agentId}",
    agentId as string
  );
  const agentGender = getAgentGender(db, agentId as string);
  forwardToCallback(callbackUrl, {
    agentId,
    channel: "sms",
    direction: "inbound",
    from: body.From,
    to: body.To,
    body: body.Body || "",
    mediaUrl: body.MediaUrl0 || null,
    mediaType: body.MediaContentType0 || null,
    externalId: body.MessageSid || null,
    agentGender,
  }, { db, agentId: agentId as string, orgId, channel: "sms", from: body.From, to: body.To, body: body.Body || "", mediaUrl: body.MediaUrl0 || null, externalId: body.MessageSid || null });

  // Return empty TwiML — Twilio expects this
  res.status(200).type("text/xml").send("<Response/>");
}

/** POST to the agent's callback URL. On failure, queue to dead_letters. */
function forwardToCallback(
  url: string,
  payload: Record<string, unknown>,
  deadLetterCtx: { db: any; agentId: string; orgId: string; channel: string; from: string; to: string; body: string; mediaUrl?: string | null; externalId?: string | null },
): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((resp) => {
      if (resp.ok) {
        logger.info("inbound_sms_callback_sent", { url, status: resp.status });
      } else {
        logger.warn("inbound_sms_callback_error", { url, status: resp.status });
        queueDeadLetter(deadLetterCtx, `Callback returned ${resp.status}`);
      }
    })
    .catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("inbound_sms_callback_failed", { url, error: errMsg });
      queueDeadLetter(deadLetterCtx, errMsg);
    });
}

function queueDeadLetter(ctx: { db: any; agentId: string; orgId: string; channel: string; from: string; to: string; body: string; mediaUrl?: string | null; externalId?: string | null }, error: string): void {
  try {
    ctx.db.run(
      `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, media_url, external_id, error_details, status)
       VALUES (?, ?, ?, ?, 'inbound', 'agent_offline', ?, ?, ?, ?, ?, ?, 'pending')`,
      [randomUUID(), ctx.agentId, ctx.orgId, ctx.channel, ctx.from, ctx.to, ctx.body, ctx.mediaUrl || null, ctx.externalId || null, error]
    );
  } catch (e) {
    logger.error("dead_letter_queue_error", { agentId: ctx.agentId, error: String(e) });
  }
}
