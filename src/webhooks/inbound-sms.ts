/**
 * Inbound SMS webhook handler.
 *
 * Twilio POSTs here when someone texts an agent's phone number.
 * Flow: parse body → find agent → store message → forward to callback → return TwiML.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
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
    "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ? AND phone_number = ?",
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

  // Look up org_id for multi-tenant scoping
  let orgId = "default";
  try {
    const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
  } catch {}

  // Store message in database
  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, media_url, media_type, external_id, status, org_id)
     VALUES (?, ?, 'sms', 'inbound', ?, ?, ?, ?, ?, ?, 'received', ?)`,
    [
      messageId,
      agentId,
      body.From,
      body.To,
      body.Body || null,
      body.MediaUrl0 || null,
      body.MediaContentType0 || null,
      body.MessageSid || null,
      orgId,
    ]
  );

  logger.info("inbound_sms_stored", { messageId, agentId, from: body.From });

  // Forward to callback URL (best-effort)
  const callbackUrl = config.agentosCallbackUrl.replace(
    "{agentId}",
    agentId as string
  );
  forwardToCallback(callbackUrl, {
    messageId,
    agentId,
    channel: "sms",
    direction: "inbound",
    from: body.From,
    to: body.To,
    body: body.Body || "",
    mediaUrl: body.MediaUrl0 || null,
    mediaType: body.MediaContentType0 || null,
    externalId: body.MessageSid || null,
  });

  // Return empty TwiML — Twilio expects this
  res.status(200).type("text/xml").send("<Response/>");
}

/** Best-effort POST to the agent's callback URL. Logs failure but never throws. */
function forwardToCallback(url: string, payload: Record<string, unknown>): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((resp) => {
      logger.info("inbound_sms_callback_sent", { url, status: resp.status });
    })
    .catch((err) => {
      logger.warn("inbound_sms_callback_failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
