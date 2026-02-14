/**
 * WebSocket handler for live voice conversations via ConversationRelay.
 *
 * Twilio opens a WebSocket after the ConversationRelay TwiML is returned.
 * Messages flow:
 *   setup     → initialize session
 *   prompt    → caller's transcribed speech → send to LLM → stream tokens back
 *   interrupt → cancel current LLM generation
 *   dtmf      → keypress events
 *
 * LLM responses are streamed back as { type: "text", token, last } messages.
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
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

/** Create Anthropic client (lazy — only when first prompt arrives) */
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;
  if (!config.anthropicApiKey) return null;
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  return anthropicClient;
}

/** Handle a new WebSocket connection from Twilio ConversationRelay */
export function handleVoiceWebSocket(ws: WebSocket, req: IncomingMessage): void {
  const agentId = extractAgentId(req.url);
  const params = extractQueryParams(req.url);
  const sessionId = params.get("session");

  logger.info("voice_ws_connected", { agentId, sessionId, url: req.url });

  // We'll set up the conversation when the "setup" message arrives
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
      case "setup":
        callSid = (msg.callSid as string) || null;
        const from = (msg.from as string) || "";
        const to = (msg.to as string) || "";

        // Read system prompt from call config (outbound) or use default
        const callConfig = sessionId ? getCallConfig(sessionId) : undefined;
        const systemPrompt = callConfig?.systemPrompt || config.voiceDefaultSystemPrompt;

        const conv: VoiceConversation = {
          agentId: agentId || "unknown",
          callSid: callSid || "unknown",
          from,
          to,
          systemPrompt,
          history: [],
          abortController: null,
        };

        storeConversation(callSid || "unknown", conv);

        logger.info("voice_ws_setup", { agentId, callSid, from, to });
        break;

      case "prompt": {
        const voicePrompt = (msg.voicePrompt as string) || "";
        if (!voicePrompt.trim()) break;

        const conv = callSid ? getConversation(callSid) : undefined;
        if (!conv) {
          logger.warn("voice_ws_no_session", { callSid, agentId });
          break;
        }

        logger.info("voice_ws_prompt", { callSid, agentId, promptLength: voicePrompt.length });

        // Add user message to history
        conv.history.push({ role: "user", content: voicePrompt });

        // Get LLM response
        const client = getAnthropicClient();
        if (!client) {
          // No API key — send a fallback message
          logger.warn("voice_ws_no_anthropic_key", { agentId });
          const fallback = config.demoMode
            ? "I'm running in demo mode without an AI model connected. Your message was received."
            : "I'm sorry, the AI service is not configured. Please try again later.";

          ws.send(JSON.stringify({ type: "text", token: fallback, last: true }));
          conv.history.push({ role: "assistant", content: fallback });
          break;
        }

        // Create abort controller for interrupt support
        const abortController = new AbortController();
        conv.abortController = abortController;

        try {
          const stream = client.messages.stream(
            {
              model: "claude-sonnet-4-20250514",
              max_tokens: 300,
              system: conv.systemPrompt,
              messages: conv.history.map((m) => ({
                role: m.role,
                content: m.content,
              })),
            },
            { signal: abortController.signal }
          );

          let fullResponse = "";

          stream.on("text", (text) => {
            fullResponse += text;
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "text", token: text, last: false }));
            }
          });

          await stream.finalMessage();

          // Send the final marker
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "text", token: "", last: true }));
          }

          conv.history.push({ role: "assistant", content: fullResponse });
          conv.abortController = null;

          logger.info("voice_ws_response_complete", {
            callSid,
            agentId,
            responseLength: fullResponse.length,
          });
        } catch (err: unknown) {
          conv.abortController = null;

          // If aborted via interrupt, that's expected
          if (err instanceof Error && err.name === "AbortError") {
            logger.info("voice_ws_generation_aborted", { callSid, agentId });
            break;
          }

          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error("voice_ws_llm_error", { callSid, agentId, error: errMsg });

          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: "text",
                token: "I'm sorry, I encountered an error. Could you repeat that?",
                last: true,
              })
            );
          }
        }
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
