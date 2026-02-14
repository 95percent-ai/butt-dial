/**
 * Inbound WhatsApp webhook handler.
 *
 * Twilio POSTs here when someone sends a WhatsApp message to an agent's number.
 * Same format as SMS but From/To have `whatsapp:` prefix.
 * Flow: parse body → strip prefix → find agent → store message → forward to callback → return TwiML.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

interface AgentRow {
  agent_id: string;
  whatsapp_sender_sid: string | null;
  status: string;
}

interface TwilioWhatsAppBody {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

/** Strip the `whatsapp:` prefix from a Twilio WhatsApp number. */
function stripWhatsAppPrefix(value: string): string {
  return value.startsWith("whatsapp:") ? value.slice(9) : value;
}

export async function handleInboundWhatsApp(req: Request, res: Response): Promise<void> {
  const { agentId } = req.params;
  const body = req.body as TwilioWhatsAppBody;

  logger.info("inbound_whatsapp_received", {
    agentId,
    from: body.From,
    to: body.To,
    messageSid: body.MessageSid,
  });

  // Validate required fields
  if (!body.From || !body.To) {
    logger.warn("inbound_whatsapp_missing_fields", { agentId, body });
    res.status(400).send("<Response/>");
    return;
  }

  const fromNumber = stripWhatsAppPrefix(body.From);
  const toNumber = stripWhatsAppPrefix(body.To);

  const db = getProvider("database");

  // Look up agent by matching the WhatsApp sender SID
  const rows = db.query<AgentRow>(
    "SELECT agent_id, whatsapp_sender_sid, status FROM agent_channels WHERE agent_id = ? AND whatsapp_sender_sid = ?",
    [agentId, toNumber]
  );

  if (rows.length === 0) {
    logger.warn("inbound_whatsapp_agent_not_found", { agentId, to: toNumber });
    res.status(404).send("<Response/>");
    return;
  }

  const agent = rows[0];

  if (agent.status !== "active") {
    logger.warn("inbound_whatsapp_agent_inactive", { agentId, status: agent.status });
    res.status(200).send("<Response/>");
    return;
  }

  // Store message in database
  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, media_url, media_type, external_id, status)
     VALUES (?, ?, 'whatsapp', 'inbound', ?, ?, ?, ?, ?, ?, 'received')`,
    [
      messageId,
      agentId,
      fromNumber,
      toNumber,
      body.Body || null,
      body.MediaUrl0 || null,
      body.MediaContentType0 || null,
      body.MessageSid || null,
    ]
  );

  logger.info("inbound_whatsapp_stored", { messageId, agentId, from: fromNumber });

  // Forward to callback URL (best-effort)
  const callbackUrl = config.agentosCallbackUrl.replace(
    "{agentId}",
    agentId as string
  );
  forwardToCallback(callbackUrl, {
    messageId,
    agentId,
    channel: "whatsapp",
    direction: "inbound",
    from: fromNumber,
    to: toNumber,
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
      logger.info("inbound_whatsapp_callback_sent", { url, status: resp.status });
    })
    .catch((err) => {
      logger.warn("inbound_whatsapp_callback_failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
