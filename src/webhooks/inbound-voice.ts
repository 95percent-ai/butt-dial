/**
 * Inbound/outbound voice webhook handlers.
 *
 * - handleInboundVoice: Twilio POSTs here when someone dials the agent's number.
 *   First checks for a bridge route (cheap call forwarding). If found, returns
 *   <Dial> TwiML. Otherwise returns ConversationRelay TwiML for live AI voice.
 *
 * - handleOutboundVoice: Twilio hits this when an agent-initiated call connects.
 *   Reads the call config from the session store, returns the same ConversationRelay TwiML.
 */

import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getCallConfig } from "./voice-sessions.js";
import { getAgentLanguage } from "../lib/translator.js";
import type { BridgeRoute } from "../providers/interfaces.js";

interface AgentRow {
  agent_id: string;
  phone_number: string | null;
  status: string;
}

interface TwilioVoiceBody {
  CallSid?: string;
  From?: string;
  To?: string;
  Direction?: string;
  CallStatus?: string;
}

/** Build the WebSocket URL for ConversationRelay */
function buildWsUrl(agentId: string, extra?: string): string {
  // Convert http(s) to ws(s)
  const wsBase = config.webhookBaseUrl
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
  const base = `${wsBase}/webhooks/${agentId}/voice-ws`;
  return extra ? `${base}?${extra}` : base;
}

export async function handleInboundVoice(req: Request, res: Response): Promise<void> {
  const agentId = String(req.params.agentId);
  const body = req.body as TwilioVoiceBody;

  logger.info("inbound_voice_received", {
    agentId,
    from: body.From,
    to: body.To,
    callSid: body.CallSid,
  });

  if (!body.From || !body.To) {
    logger.warn("inbound_voice_missing_fields", { agentId, body });
    res.status(400).type("text/xml").send("<Response/>");
    return;
  }

  const db = getProvider("database");

  // Look up agent
  const rows = db.query<AgentRow>(
    "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ? AND phone_number = ?",
    [agentId, body.To]
  );

  if (rows.length === 0) {
    logger.warn("inbound_voice_agent_not_found", { agentId, to: body.To });
    res.status(404).type("text/xml").send("<Response/>");
    return;
  }

  const agent = rows[0];

  if (agent.status !== "active") {
    logger.warn("inbound_voice_agent_inactive", { agentId, status: agent.status });
    res.status(200).type("text/xml").send("<Response/>");
    return;
  }

  // Look up org_id for multi-tenant scoping
  let orgId = "default";
  try {
    const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
  } catch {}

  // --- Bridge detection: check if this call matches a bridge route ---
  try {
    const bridgeRoutes = db.query<BridgeRoute>(
      `SELECT * FROM bridge_registry
       WHERE local_number = ? AND active = 1 AND org_id = ?
       AND (caller_pattern = ? OR caller_pattern = '*')
       ORDER BY CASE WHEN caller_pattern = '*' THEN 1 ELSE 0 END
       LIMIT 1`,
      [body.To, orgId, body.From]
    );

    if (bridgeRoutes.length > 0) {
      const route = bridgeRoutes[0];

      // Log bridge call
      const bridgeCallId = randomUUID();
      const statusCallbackUrl = `${config.webhookBaseUrl}/webhooks/bridge-status?bridgeCallId=${bridgeCallId}`;

      db.run(
        `INSERT INTO bridge_calls (id, bridge_id, inbound_sid, caller, destination, status, org_id)
         VALUES (?, ?, ?, ?, ?, 'in-progress', ?)`,
        [bridgeCallId, route.id, body.CallSid || null, body.From, route.destination_number, orgId]
      );

      // Return <Dial> TwiML — Twilio bridges audio between both legs
      const dialTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${body.To}" action="${statusCallbackUrl}"><Number statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed">${route.destination_number}</Number></Dial></Response>`;

      logger.info("inbound_voice_bridge_matched", {
        agentId,
        bridgeCallId,
        routeId: route.id,
        from: body.From,
        destination: route.destination_number,
        label: route.label,
      });

      res.status(200).type("text/xml").send(dialTwiml);
      return;
    }
  } catch {
    // bridge_registry table might not exist yet — continue to normal voice flow
  }

  // --- Normal AI voice flow (no bridge match) ---

  // Store inbound call in messages table
  const messageId = randomUUID();
  db.run(
    `INSERT INTO messages (id, agent_id, channel, direction, from_address, to_address, body, external_id, status, org_id)
     VALUES (?, ?, 'voice', 'inbound', ?, ?, ?, ?, 'received', ?)`,
    [messageId, agentId, body.From, body.To, null, body.CallSid || null, orgId]
  );

  // Build TwiML via voice orchestrator — use agent's language instead of global default
  const voiceOrch = getProvider("voiceOrchestration");
  const wsUrl = buildWsUrl(agentId);
  const agentLang = getAgentLanguage(db, agentId);

  const twiml = voiceOrch.getConnectionTwiml({
    agentId,
    websocketUrl: wsUrl,
    voice: config.voiceDefaultVoice,
    greeting: config.voiceDefaultGreeting,
    language: agentLang,
  });

  logger.info("inbound_voice_twiml_sent", { agentId, messageId, wsUrl });

  res.status(200).type("text/xml").send(twiml);
}

export async function handleOutboundVoice(req: Request, res: Response): Promise<void> {
  const agentId = String(req.params.agentId);
  const rawSession = req.query.session;
  const sessionId = typeof rawSession === "string" ? rawSession : undefined;
  const body = req.body as TwilioVoiceBody;

  logger.info("outbound_voice_webhook", {
    agentId,
    sessionId,
    callSid: body.CallSid,
    from: body.From,
    to: body.To,
  });

  // Read call config from session store (set by comms_make_call)
  // NOTE: Don't remove it here — the WebSocket handler needs it for the system prompt.
  // The WS handler's setup phase will clean it up.
  const callConfig = sessionId ? getCallConfig(sessionId) : undefined;

  const voiceOrch = getProvider("voiceOrchestration");
  const wsUrl = buildWsUrl(
    agentId,
    sessionId ? `session=${sessionId}` : undefined
  );

  const twiml = voiceOrch.getConnectionTwiml({
    agentId,
    websocketUrl: wsUrl,
    voice: callConfig?.voice || config.voiceDefaultVoice,
    greeting: callConfig?.greeting || config.voiceDefaultGreeting,
    language: callConfig?.language || config.voiceDefaultLanguage,
  });

  logger.info("outbound_voice_twiml_sent", { agentId, sessionId, wsUrl });

  res.status(200).type("text/xml").send(twiml);
}
