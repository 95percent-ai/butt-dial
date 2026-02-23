/**
 * Inbound LINE webhook handler.
 *
 * LINE POSTs here when someone sends a message to the agent's LINE Official Account.
 * Flow: verify x-line-signature → parse events → for each message event → find agent → forward → queue dead letter on failure → return 200.
 */

import { randomUUID, createHmac } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { isChannelBlocked } from "../lib/channel-blocker.js";
import { getAgentGender } from "../lib/gender-context.js";

interface AgentRow {
  agent_id: string;
  line_channel_id: string | null;
  status: string;
  blocked_channels: string | null;
}

interface LineEvent {
  type: string;
  source?: {
    type?: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    id?: string;
    type?: string;
    text?: string;
  };
  replyToken?: string;
  timestamp?: number;
}

interface LineWebhookBody {
  events?: LineEvent[];
  destination?: string;
}

/** Verify LINE webhook signature using HMAC-SHA256. */
export function verifyLineSignature(channelSecret: string, body: string, signature: string): boolean {
  const hash = createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export async function handleInboundLine(req: Request, res: Response): Promise<void> {
  const { agentId } = req.params;

  // LINE expects HTTP 200 quickly — verify signature first
  const signature = req.headers["x-line-signature"] as string | undefined;
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  if (!config.demoMode && config.lineChannelSecret) {
    if (!signature || !verifyLineSignature(config.lineChannelSecret, rawBody, signature)) {
      logger.warn("inbound_line_signature_invalid", { agentId });
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const webhookBody = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as LineWebhookBody;
  const events = webhookBody.events || [];

  logger.info("inbound_line_received", {
    agentId,
    eventCount: events.length,
    destination: webhookBody.destination,
  });

  // Process each message event
  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") {
      continue; // Only handle text messages for now
    }

    const userId = event.source?.userId;
    const messageText = event.message?.text || "";
    const lineMessageId = event.message?.id;

    if (!userId) {
      logger.warn("inbound_line_no_user_id", { agentId, event });
      continue;
    }

    const db = getProvider("database");

    // Look up agent
    const rows = db.query<AgentRow>(
      "SELECT agent_id, line_channel_id, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
      [agentId]
    );

    if (rows.length === 0) {
      logger.warn("inbound_line_agent_not_found", { agentId });
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const agent = rows[0];

    if (agent.status !== "active") {
      logger.warn("inbound_line_agent_inactive", { agentId, status: agent.status });
      res.status(200).send(""); // LINE expects 200
      return;
    }

    if (isChannelBlocked(agent.blocked_channels, "line")) {
      logger.warn("inbound_line_channel_blocked", { agentId });
      res.status(200).send(""); // LINE expects 200
      return;
    }

    // Look up org_id
    let orgId = "default";
    try {
      const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
      if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
    } catch {}

    // Forward to callback URL — queue to dead_letters on failure
    const callbackUrl = config.agentosCallbackUrl.replace("{agentId}", agentId as string);
    const agentGender = getAgentGender(db, agentId as string);
    forwardToCallback(callbackUrl, {
      agentId,
      channel: "line",
      direction: "inbound",
      from: userId,
      to: agentId,
      body: messageText,
      externalId: lineMessageId || null,
      agentGender,
    }, { db, agentId: agentId as string, orgId, channel: "line", from: userId, to: agentId as string, body: messageText, externalId: lineMessageId || null });
  }

  // LINE expects HTTP 200 with empty body
  res.status(200).send("");
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
        logger.info("inbound_line_callback_sent", { url, status: resp.status });
      } else {
        logger.warn("inbound_line_callback_error", { url, status: resp.status });
        queueDeadLetter(deadLetterCtx, `Callback returned ${resp.status}`);
      }
    })
    .catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("inbound_line_callback_failed", { url, error: errMsg });
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
