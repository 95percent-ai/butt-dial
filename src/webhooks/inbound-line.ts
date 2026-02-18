/**
 * Inbound LINE webhook handler.
 *
 * LINE POSTs here when someone sends a message to the agent's LINE Official Account.
 * Flow: verify x-line-signature → parse events → for each message event → find agent → store → forward → return 200.
 */

import { randomUUID, createHmac } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { detectLanguage, translate, needsTranslation, getAgentLanguage } from "../lib/translator.js";

interface AgentRow {
  agent_id: string;
  line_channel_id: string | null;
  status: string;
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
      "SELECT agent_id, line_channel_id, status FROM agent_channels WHERE agent_id = ?",
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

    // Look up org_id
    let orgId = "default";
    try {
      const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
      if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
    } catch {}

    // Detect language and translate if needed
    let translatedBody = messageText;
    let sourceLanguage: string | null = null;
    const agentLang = getAgentLanguage(db, String(agentId));

    if (messageText && config.translationEnabled) {
      sourceLanguage = await detectLanguage(messageText);
      if (sourceLanguage && sourceLanguage !== "unknown" && needsTranslation(sourceLanguage, agentLang)) {
        translatedBody = await translate(messageText, sourceLanguage, agentLang);
        logger.info("inbound_line_translated", {
          agentId,
          from: userId,
          sourceLanguage,
          agentLanguage: agentLang,
          originalLength: messageText.length,
          translatedLength: translatedBody.length,
        });
      }
    }

    // Store message
    const messageId = randomUUID();
    db.run(
      `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, body_original, source_language, external_id, status, org_id)
       VALUES (?, ?, 'line', 'inbound', ?, ?, ?, ?, ?, ?, 'received', ?)`,
      [
        messageId,
        agentId,
        userId,
        agentId,
        translatedBody || null,
        messageText !== translatedBody ? messageText : null,
        sourceLanguage,
        lineMessageId || null,
        orgId,
      ]
    );

    logger.info("inbound_line_stored", { messageId, agentId, from: userId });

    // Forward to callback URL (best-effort)
    const callbackUrl = config.agentosCallbackUrl.replace("{agentId}", agentId as string);
    forwardToCallback(callbackUrl, {
      messageId,
      agentId,
      channel: "line",
      direction: "inbound",
      from: userId,
      to: agentId,
      body: translatedBody,
      bodyOriginal: messageText !== translatedBody ? messageText : undefined,
      sourceLanguage: sourceLanguage || undefined,
      externalId: lineMessageId || null,
    });
  }

  // LINE expects HTTP 200 with empty body
  res.status(200).send("");
}

/** Best-effort POST to the agent's callback URL. Logs failure but never throws. */
function forwardToCallback(url: string, payload: Record<string, unknown>): void {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((resp) => {
      logger.info("inbound_line_callback_sent", { url, status: resp.status });
    })
    .catch((err) => {
      logger.warn("inbound_line_callback_failed", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
