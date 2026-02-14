/**
 * Inbound email webhook handler.
 *
 * Resend POSTs here when someone sends an email to an agent's address.
 * Flow: parse body → find agent → store message → forward to callback → return 200.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

interface AgentRow {
  agent_id: string;
  email_address: string | null;
  status: string;
}

interface ResendEmailPayload {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
  };
}

export async function handleInboundEmail(req: Request, res: Response): Promise<void> {
  const { agentId } = req.params;
  const payload = req.body as ResendEmailPayload;

  logger.info("inbound_email_received", {
    agentId,
    type: payload.type,
    from: payload.data?.from,
    to: payload.data?.to,
    subject: payload.data?.subject,
  });

  // Validate payload
  if (!payload.data?.from || !payload.data?.to) {
    logger.warn("inbound_email_missing_fields", { agentId, payload });
    res.status(400).json({ error: "Missing from or to" });
    return;
  }

  const db = getProvider("database");

  // Look up agent by matching the email address
  const rows = db.query<AgentRow>(
    "SELECT agent_id, email_address, status FROM agent_channels WHERE agent_id = ? AND email_address = ?",
    [agentId, payload.data.to]
  );

  if (rows.length === 0) {
    logger.warn("inbound_email_agent_not_found", { agentId, to: payload.data.to });
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const agent = rows[0];

  if (agent.status !== "active") {
    logger.warn("inbound_email_agent_inactive", { agentId, status: agent.status });
    res.status(200).json({ ok: true });
    return;
  }

  // Store message in database
  const messageId = randomUUID();
  const bodyText = payload.data.subject
    ? `[${payload.data.subject}] ${payload.data.text || ""}`
    : payload.data.text || "";

  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status)
     VALUES (?, ?, 'email', 'inbound', ?, ?, ?, ?, 'received')`,
    [
      messageId,
      agentId,
      payload.data.from,
      payload.data.to,
      bodyText,
      payload.data.email_id || null,
    ]
  );

  logger.info("inbound_email_stored", { messageId, agentId, from: payload.data.from });

  // Forward to callback URL (best-effort)
  const callbackUrl = config.agentosCallbackUrl.replace("{agentId}", agentId as string);
  forwardToCallback(callbackUrl, {
    messageId,
    agentId,
    channel: "email",
    direction: "inbound",
    from: payload.data.from,
    to: payload.data.to,
    subject: payload.data.subject || null,
    body: payload.data.text || "",
    html: payload.data.html || null,
    externalId: payload.data.email_id || null,
  });

  // Resend expects 200 OK
  res.status(200).json({ ok: true });
}

/** Best-effort POST to the agent's callback URL. Logs failure but never throws. */
function forwardToCallback(url: string, payload: Record<string, unknown>): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((resp) => {
      logger.info("inbound_email_callback_sent", { url, status: resp.status });
    })
    .catch((err) => {
      logger.warn("inbound_email_callback_failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
