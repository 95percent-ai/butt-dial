/**
 * Inbound email webhook handler.
 *
 * Resend POSTs here when someone sends an email to an agent's address.
 * Flow: parse body → find agent → forward to callback → queue dead letter on failure → return 200.
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

  // Look up org_id for multi-tenant scoping
  let orgId = "default";
  try {
    const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
  } catch {}

  const bodyText = payload.data.subject
    ? `[${payload.data.subject}] ${payload.data.text || ""}`
    : payload.data.text || "";

  // Forward to callback URL — queue to dead_letters on failure
  const callbackUrl = config.agentosCallbackUrl.replace("{agentId}", agentId as string);
  forwardToCallback(callbackUrl, {
    agentId,
    channel: "email",
    direction: "inbound",
    from: payload.data.from,
    to: payload.data.to,
    subject: payload.data.subject || null,
    body: payload.data.text || "",
    html: payload.data.html || null,
    externalId: payload.data.email_id || null,
  }, { db, agentId: agentId as string, orgId, channel: "email", from: payload.data.from, to: payload.data.to, body: bodyText, externalId: payload.data.email_id || null });

  // Resend expects 200 OK
  res.status(200).json({ ok: true });
}

/** POST to the agent's callback URL. On failure, queue to dead_letters. */
function forwardToCallback(
  url: string,
  payload: Record<string, unknown>,
  deadLetterCtx: { db: any; agentId: string; orgId: string; channel: string; from: string; to: string; body: string; externalId?: string | null },
): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((resp) => {
      if (resp.ok) {
        logger.info("inbound_email_callback_sent", { url, status: resp.status });
      } else {
        logger.warn("inbound_email_callback_error", { url, status: resp.status });
        queueDeadLetter(deadLetterCtx, `Callback returned ${resp.status}`);
      }
    })
    .catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("inbound_email_callback_failed", { url, error: errMsg });
      queueDeadLetter(deadLetterCtx, errMsg);
    });
}

function queueDeadLetter(ctx: { db: any; agentId: string; orgId: string; channel: string; from: string; to: string; body: string; externalId?: string | null }, error: string): void {
  try {
    ctx.db.run(
      `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, external_id, error_details, status)
       VALUES (?, ?, ?, ?, 'inbound', 'agent_offline', ?, ?, ?, ?, ?, 'pending')`,
      [randomUUID(), ctx.agentId, ctx.orgId, ctx.channel, ctx.from, ctx.to, ctx.body, ctx.externalId || null, error]
    );
  } catch (e) {
    logger.error("dead_letter_queue_error", { agentId: ctx.agentId, error: String(e) });
  }
}
