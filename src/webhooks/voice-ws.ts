/**
 * WebSocket handler for live voice conversations via ConversationRelay.
 *
 * Twilio opens a WebSocket after the ConversationRelay TwiML is returned.
 * Messages flow:
 *   setup     → initialize session
 *   prompt    → caller's transcribed speech → route to agent or answering machine
 *   interrupt → cancel current generation
 *   dtmf      → keypress events
 *
 * Three response paths:
 *   A) Agent connected — MCP sampling (createMessage) routes transcript to client LLM
 *   B) Answering machine — Anthropic SDK collects voicemail when no agent available
 *   C) Hard-coded fallback — no agent AND no Anthropic key
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getAgentSession } from "../lib/agent-registry.js";
import { getProvider } from "../providers/factory.js";
import {
  storeConversation,
  getConversation,
  removeConversation,
  getCallConfig,
  type VoiceConversation,
} from "./voice-sessions.js";

/** Extract agentId from the WebSocket URL path: /webhooks/:agentId/voice-ws */
function extractAgentId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/webhooks\/([^/]+)\/voice-ws/);
  return match ? match[1] : null;
}

/** Extract query params from URL */
function extractQueryParams(url: string | undefined): URLSearchParams {
  if (!url) return new URLSearchParams();
  const qIndex = url.indexOf("?");
  return qIndex >= 0 ? new URLSearchParams(url.slice(qIndex + 1)) : new URLSearchParams();
}

const SAMPLING_TIMEOUT_MS = 8000;

const ANSWERING_MACHINE_SYSTEM_PROMPT = `You are a voicemail assistant. The person you're speaking for is not available right now.
Your job:
1. Greet the caller politely and let them know the person is unavailable.
2. Ask the caller to leave a message.
3. Ask if they have any preferences for how or when they'd like to be contacted back.
4. Thank them and say goodbye.
Keep responses short and natural — this is a phone call, not a chat.`;

const UNAVAILABLE_MESSAGE =
  "No one is available to take your call right now. Please try again later. Goodbye.";

/**
 * Try to get a response from the connected agent via MCP sampling.
 * Returns the agent's text response, or null if sampling failed/timed out.
 */
async function tryAgentSampling(
  agentId: string,
  conv: VoiceConversation
): Promise<string | null> {
  const session = getAgentSession(agentId);
  if (!session) return null;

  try {
    const samplingPromise = session.server.createMessage({
      messages: conv.history.map((m) => ({
        role: m.role,
        content: { type: "text" as const, text: m.content },
      })),
      systemPrompt: conv.systemPrompt,
      maxTokens: 300,
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SAMPLING_TIMEOUT_MS)
    );

    const result = await Promise.race([samplingPromise, timeoutPromise]);

    if (!result) {
      logger.warn("agent_sampling_timeout", { agentId, timeoutMs: SAMPLING_TIMEOUT_MS });
      return null;
    }

    // Extract text from response content
    const content = result.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const textBlock = content.find((b) => b.type === "text");
      return textBlock && "text" in textBlock ? textBlock.text : null;
    }
    if (content && typeof content === "object" && "type" in content && content.type === "text" && "text" in content) {
      return content.text;
    }

    return null;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn("agent_sampling_failed", { agentId, error: errMsg });
    return null;
  }
}

/**
 * Get a response from the Anthropic answering machine.
 * Returns the full response text, or null if Anthropic is unavailable.
 */
async function tryAnsweringMachine(
  conv: VoiceConversation
): Promise<string | null> {
  if (!config.anthropicApiKey) return null;

  try {
    // Dynamic import — Anthropic SDK is optional
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: ANSWERING_MACHINE_SYSTEM_PROMPT,
      messages: conv.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : null;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("answering_machine_error", { error: errMsg });
    return null;
  }
}

/** Store voicemail in DB after an answering-machine call ends */
function storeVoicemail(conv: VoiceConversation): void {
  if (!conv.voicemailCollected?.callerMessage) return;

  try {
    const db = getProvider("database");
    const id = randomUUID();

    // Build transcript from full history
    const transcript = conv.history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    db.run(
      `INSERT INTO voicemail_messages (id, agent_id, call_sid, caller_from, caller_to, transcript, caller_message, caller_preferences, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        id,
        conv.agentId,
        conv.callSid,
        conv.from,
        conv.to,
        transcript,
        conv.voicemailCollected.callerMessage,
        conv.voicemailCollected.callerPreferences || null,
      ]
    );

    logger.info("voicemail_stored", { id, agentId: conv.agentId, callSid: conv.callSid });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("voicemail_store_error", { agentId: conv.agentId, error: errMsg });
  }
}

/** Handle a new WebSocket connection from Twilio ConversationRelay */
export function handleVoiceWebSocket(ws: WebSocket, req: IncomingMessage): void {
  const agentId = extractAgentId(req.url);
  const params = extractQueryParams(req.url);
  const sessionId = params.get("session");

  logger.info("voice_ws_connected", { agentId, sessionId, url: req.url });

  let callSid: string | null = null;

  ws.on("message", async (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      logger.warn("voice_ws_invalid_json", { agentId });
      return;
    }

    const type = msg.type as string;

    switch (type) {
      case "setup": {
        callSid = (msg.callSid as string) || null;
        const from = (msg.from as string) || "";
        const to = (msg.to as string) || "";

        // Read system prompt from call config (outbound) or use default
        const callConfig = sessionId ? getCallConfig(sessionId) : undefined;
        const systemPrompt = callConfig?.systemPrompt || config.voiceDefaultSystemPrompt;

        // Determine mode: agent connected → "agent", otherwise → "answering-machine"
        const agentSession = agentId ? getAgentSession(agentId) : undefined;
        const mode = agentSession ? "agent" : "answering-machine";

        const conv: VoiceConversation = {
          agentId: agentId || "unknown",
          callSid: callSid || "unknown",
          from,
          to,
          systemPrompt,
          history: [],
          abortController: null,
          mode,
        };

        storeConversation(callSid || "unknown", conv);

        // Create call_logs entry
        try {
          const callDb = getProvider("database");
          const logId = randomUUID();
          callDb.run(
            `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status)
             VALUES (?, ?, ?, ?, ?, ?, 'in-progress')`,
            [logId, agentId || "unknown", callSid || "unknown",
             callConfig ? "outbound" : "inbound", from, to]
          );
        } catch {
          // Best-effort logging — call_logs table might not exist yet
        }

        logger.info("voice_ws_setup", { agentId, callSid, from, to, mode });
        break;
      }

      case "prompt": {
        const voicePrompt = (msg.voicePrompt as string) || "";
        if (!voicePrompt.trim()) break;

        const conv = callSid ? getConversation(callSid) : undefined;
        if (!conv) {
          logger.warn("voice_ws_no_session", { callSid, agentId });
          break;
        }

        logger.info("voice_ws_prompt", {
          callSid,
          agentId,
          mode: conv.mode,
          promptLength: voicePrompt.length,
        });

        // Add user message to history
        conv.history.push({ role: "user", content: voicePrompt });

        // Track caller messages for voicemail collection in answering-machine mode
        if (conv.mode === "answering-machine") {
          if (!conv.voicemailCollected) {
            conv.voicemailCollected = { callerMessage: voicePrompt };
          } else {
            // Append subsequent messages
            conv.voicemailCollected.callerMessage += "\n" + voicePrompt;
          }
        }

        let responseText: string | null = null;

        // Path A: Agent connected — try MCP sampling
        if (conv.mode === "agent" && agentId) {
          responseText = await tryAgentSampling(agentId, conv);

          if (!responseText) {
            // Sampling failed/timed out — switch to answering machine for rest of call
            logger.info("voice_ws_fallback_to_answering_machine", { callSid, agentId });
            conv.mode = "answering-machine";
            conv.voicemailCollected = { callerMessage: voicePrompt };
          }
        }

        // Path B: Answering machine — use Anthropic if available
        if (!responseText && conv.mode === "answering-machine") {
          responseText = await tryAnsweringMachine(conv);
        }

        // Path C: No agent, no Anthropic — hard-coded fallback
        if (!responseText) {
          responseText = UNAVAILABLE_MESSAGE;
        }

        // Send complete response to Twilio
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "text", token: responseText, last: true }));
        }

        conv.history.push({ role: "assistant", content: responseText });

        logger.info("voice_ws_response_complete", {
          callSid,
          agentId,
          mode: conv.mode,
          responseLength: responseText.length,
        });
        break;
      }

      case "interrupt": {
        const conv = callSid ? getConversation(callSid) : undefined;
        if (conv?.abortController) {
          conv.abortController.abort();
          conv.abortController = null;
          logger.info("voice_ws_interrupt", { callSid, agentId });
        }
        break;
      }

      case "dtmf": {
        const digit = msg.digit as string;
        logger.info("voice_ws_dtmf", { callSid, agentId, digit });
        break;
      }

      default:
        logger.info("voice_ws_unknown_type", { callSid, agentId, type });
    }
  });

  ws.on("close", () => {
    logger.info("voice_ws_disconnected", { agentId, callSid });

    if (callSid) {
      const conv = getConversation(callSid);

      // Store voicemail if we were in answering-machine mode
      if (conv?.mode === "answering-machine" && conv.voicemailCollected) {
        storeVoicemail(conv);
      }

      removeConversation(callSid);
    }
  });

  ws.on("error", (err) => {
    logger.error("voice_ws_error", {
      agentId,
      callSid,
      error: err.message,
    });
  });
}
