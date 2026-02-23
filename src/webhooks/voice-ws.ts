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
import { getAgentLanguage } from "../lib/translator.js";
import { applyGuardrails, checkResponseContent } from "../security/communication-guardrails.js";
import { getAgentGender, buildGenderInstructions } from "../lib/gender-context.js";

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
const FIRST_RESPONSE_DELAY_MS = 2000;
const END_SIGNAL_DELAY_MS = 500;

/** Keywords that signal the AI is ending the conversation */
const GOODBYE_PATTERNS = /\b(goodbye|bye|take care|have a good|have a great|talk to you later|end of call)\b/i;

const ANSWERING_MACHINE_SYSTEM_PROMPT = `You are a voicemail assistant. The person you're speaking for is not available right now.
Your job:
1. Greet the caller politely and let them know the person is unavailable.
2. Ask the caller to leave a message.
3. Ask if they have any preferences for how or when they'd like to be contacted back.
4. Thank them and say goodbye.
Keep responses short and natural — this is a phone call, not a chat.

You also have tools to take actions during the call:
- forward_sms: Send an SMS message to a phone number
- forward_email: Send an email to an address
- transfer_call: Transfer this call to another phone number

Use these tools when the caller asks you to forward a message, send info to someone, or transfer the call.
Do NOT use tools unless the caller explicitly asks for an action.`;

const VOICE_TOOLS = [
  {
    name: "forward_sms",
    description: "Send an SMS text message to a phone number on behalf of the caller.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" as const, description: "Destination phone number in E.164 format (e.g. +15551234567)" },
        message: { type: "string" as const, description: "The text message to send" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "forward_email",
    description: "Send an email message to an address on behalf of the caller.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" as const, description: "Destination email address" },
        subject: { type: "string" as const, description: "Email subject line" },
        message: { type: "string" as const, description: "Email body text" },
      },
      required: ["to", "subject", "message"],
    },
  },
  {
    name: "transfer_call",
    description: "Transfer the current phone call to another number.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" as const, description: "Phone number to transfer the call to in E.164 format" },
        announcement: { type: "string" as const, description: "Optional message to announce before transferring" },
      },
      required: ["to"],
    },
  },
];

const MAX_TOOL_ITERATIONS = 3;

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

/** Look up the agent's phone number and email from the DB */
function getAgentContactInfo(agentId: string): { phone: string | null; email: string | null } {
  try {
    const db = getProvider("database");
    const rows = db.query<{ phone_number: string | null; email_address: string | null }>(
      "SELECT phone_number, email_address FROM agent_channels WHERE agent_id = ?",
      [agentId]
    );
    if (rows.length > 0) {
      return { phone: rows[0].phone_number, email: rows[0].email_address };
    }
  } catch {}
  return { phone: null, email: null };
}

/** Execute a voice tool call and return a text result */
async function executeVoiceTool(
  toolName: string,
  input: Record<string, unknown>,
  conv: VoiceConversation
): Promise<string> {
  const agentContact = getAgentContactInfo(conv.agentId);

  switch (toolName) {
    case "forward_sms": {
      const to = input.to as string;
      const message = input.message as string;
      const from = agentContact.phone || conv.to; // agent's number or the number that was called
      try {
        const telephony = getProvider("telephony");
        const result = await telephony.sendSms({ from, to, body: message });
        logger.info("voice_tool_sms_sent", { callSid: conv.callSid, to, messageId: result.messageId });
        return `SMS sent successfully to ${to}. Message ID: ${result.messageId}`;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("voice_tool_sms_error", { callSid: conv.callSid, to, error: errMsg });
        return `Failed to send SMS: ${errMsg}`;
      }
    }

    case "forward_email": {
      const to = input.to as string;
      const subject = input.subject as string;
      const message = input.message as string;
      const domain = (() => { try { return new URL(config.webhookBaseUrl).hostname; } catch { return "buttdial.app"; } })();
      const from = agentContact.email || `noreply@${domain}`;
      try {
        const email = getProvider("email");
        const result = await email.send({ from, to, subject, body: message });
        logger.info("voice_tool_email_sent", { callSid: conv.callSid, to, messageId: result.messageId });
        return `Email sent successfully to ${to}. Message ID: ${result.messageId}`;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("voice_tool_email_error", { callSid: conv.callSid, to, error: errMsg });
        return `Failed to send email: ${errMsg}`;
      }
    }

    case "transfer_call": {
      const to = input.to as string;
      const announcement = input.announcement as string | undefined;
      try {
        const telephony = getProvider("telephony");
        const result = await telephony.transferCall({
          callSid: conv.callSid,
          to,
          announcementText: announcement,
        });
        logger.info("voice_tool_transfer", { callSid: conv.callSid, to, status: result.status });
        return `Call transfer initiated to ${to}. Status: ${result.status}`;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("voice_tool_transfer_error", { callSid: conv.callSid, to, error: errMsg });
        return `Failed to transfer call: ${errMsg}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

/**
 * Get a response from the Anthropic answering machine with tool-use support.
 * Loops up to MAX_TOOL_ITERATIONS times when Claude requests tool calls.
 * Returns the final text response, or null if Anthropic is unavailable.
 */
async function tryAnsweringMachine(
  conv: VoiceConversation
): Promise<string | null> {
  if (!config.anthropicApiKey) return null;

  try {
    // Dynamic import — Anthropic SDK is optional
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    // Use custom system prompt if one was provided (outbound call config),
    // otherwise fall back to the default answering machine prompt
    // Use the conversation's system prompt (already guardrailed from setup) if custom,
    // otherwise apply guardrails to the answering machine default prompt
    const isCustomPrompt = conv.systemPrompt && conv.systemPrompt !== applyGuardrails(config.voiceDefaultSystemPrompt);
    const systemPrompt = isCustomPrompt ? conv.systemPrompt : applyGuardrails(ANSWERING_MACHINE_SYSTEM_PROMPT);

    // Build messages array for the tool-use loop (copy so we don't pollute conv.history)
    const messages: Array<{ role: string; content: unknown }> = conv.history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        tools: VOICE_TOOLS as any,
        messages: messages as any,
      });

      const hasToolUse = response.content.some((b) => b.type === "tool_use");

      if (!hasToolUse) {
        // Final text response
        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock && "text" in textBlock ? textBlock.text : null;
      }

      // Process tool calls
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const toolBlock = block as { id: string; name: string; input: Record<string, unknown> };

        logger.info("voice_tool_call", {
          callSid: conv.callSid,
          tool: toolBlock.name,
          input: toolBlock.input,
          iteration: i + 1,
        });

        const result = await executeVoiceTool(toolBlock.name, toolBlock.input, conv);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Exceeded max iterations — ask Claude for a final text response without tools
    const finalResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: messages as any,
    });

    const textBlock = finalResponse.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : null;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("answering_machine_error", { error: errMsg });
    return null;
  }
}

/** Store voicemail in dead_letters after an answering-machine call ends */
function storeVoicemail(conv: VoiceConversation): void {
  if (!conv.voicemailCollected?.callerMessage) return;

  try {
    const db = getProvider("database");
    const id = randomUUID();

    // Look up org_id for multi-tenant scoping
    let orgId = "default";
    try {
      const orgRows = db.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [conv.agentId]);
      if (orgRows.length > 0 && orgRows[0].org_id) orgId = orgRows[0].org_id;
    } catch {}

    // Build transcript from full history
    const transcript = conv.history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const body = [
      conv.voicemailCollected.callerMessage,
      conv.voicemailCollected.callerPreferences ? `Preferences: ${conv.voicemailCollected.callerPreferences}` : null,
      transcript ? `\n---\nTranscript:\n${transcript}` : null,
    ].filter(Boolean).join("\n");

    db.run(
      `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, external_id, status)
       VALUES (?, ?, ?, 'voice', 'inbound', 'agent_offline', ?, ?, ?, ?, 'pending')`,
      [
        id,
        conv.agentId,
        orgId,
        conv.from,
        conv.to,
        body,
        conv.callSid,
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
  let isFirstPrompt = true;
  let callTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

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
        const systemPrompt = applyGuardrails(callConfig?.systemPrompt || config.voiceDefaultSystemPrompt);

        // Clean up the one-time session config now that we've read it
        if (sessionId) {
          const { removeCallConfig } = await import("./voice-sessions.js");
          removeCallConfig(sessionId);
        }

        // Determine mode: forceMode overrides, otherwise agent connected → "agent", else → "answering-machine"
        const agentSession = agentId ? getAgentSession(agentId) : undefined;
        const mode = callConfig?.forceMode || (agentSession ? "agent" : "answering-machine");

        // Resolve language for TTS
        const db = getProvider("database");
        const agentLang = agentId ? getAgentLanguage(db, agentId) : config.voiceDefaultLanguage;

        // Resolve gender context — outbound calls use config, inbound look up from DB
        const agentGender = callConfig?.agentGender || (agentId ? getAgentGender(db, agentId) : "male");
        const callTargetGender = callConfig?.targetGender || "unknown";

        // Append gender instructions to system prompt for inbound calls (outbound already have them)
        let finalSystemPrompt = systemPrompt;
        if (!callConfig) {
          // Inbound call — append gender instructions
          const genderInstructions = buildGenderInstructions({ language: agentLang, agentGender, targetGender: callTargetGender });
          finalSystemPrompt = systemPrompt + genderInstructions;
        }

        const conv: VoiceConversation = {
          agentId: agentId || "unknown",
          callSid: callSid || "unknown",
          from,
          to,
          systemPrompt: finalSystemPrompt,
          history: [],
          abortController: null,
          mode,
          callerLanguage: agentLang,
          agentLanguage: agentLang,
          agentGender,
          targetGender: callTargetGender,
        };

        storeConversation(callSid || "unknown", conv);

        // Create call_logs entry
        try {
          const callDb = getProvider("database");
          const logId = randomUUID();

          // Look up org_id for multi-tenant scoping
          let callOrgId = "default";
          try {
            const orgRows = callDb.query<{ org_id: string }>("SELECT org_id FROM agent_channels WHERE agent_id = ?", [agentId || "unknown"]);
            if (orgRows.length > 0 && orgRows[0].org_id) callOrgId = orgRows[0].org_id;
          } catch {}

          callDb.run(
            `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, org_id)
             VALUES (?, ?, ?, ?, ?, ?, 'in-progress', ?)`,
            [logId, agentId || "unknown", callSid || "unknown",
             callConfig ? "outbound" : "inbound", from, to, callOrgId]
          );
        } catch {
          // Best-effort logging — call_logs table might not exist yet
        }

        // Start call timeout safety net
        const maxMinutes = config.voiceMaxCallDurationMinutes;
        callTimeoutTimer = setTimeout(() => {
          logger.warn("voice_ws_call_timeout", { callSid, agentId, maxMinutes });
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: "text",
              token: "This call has reached the maximum duration. Goodbye.",
              last: true,
            }));
            setTimeout(() => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: "end" }));
              }
            }, END_SIGNAL_DELAY_MS);
          }
        }, maxMinutes * 60 * 1000);

        logger.info("voice_ws_setup", { agentId, callSid, from, to, mode, maxMinutes });
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

        // Add caller's transcription to history
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

        // On the first prompt, add a small delay so the caller finishes saying hello
        if (isFirstPrompt) {
          isFirstPrompt = false;
          await new Promise((resolve) => setTimeout(resolve, FIRST_RESPONSE_DELAY_MS));
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

        // Content filter: catch inappropriate AI output before delivery
        const contentCheck = checkResponseContent(responseText);
        if (!contentCheck.allowed) {
          logger.warn("voice_response_blocked", {
            callSid,
            agentId,
            reason: contentCheck.blockedReason,
            originalLength: responseText.length,
          });
          responseText = contentCheck.sanitized;
        }

        // Send response to Twilio
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "text", token: responseText, last: true }));
        }

        // Store agent's original response in history (untranslated)
        conv.history.push({ role: "assistant", content: responseText });

        // Detect end-of-conversation and send hangup signal
        const isGoodbye = GOODBYE_PATTERNS.test(responseText);
        const isFallback = responseText === UNAVAILABLE_MESSAGE;

        if ((isGoodbye || isFallback) && ws.readyState === ws.OPEN) {
          logger.info("voice_ws_ending_call", { callSid, agentId, isGoodbye, isFallback });
          setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "end" }));
            }
          }, END_SIGNAL_DELAY_MS);
        }

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
    if (callTimeoutTimer) clearTimeout(callTimeoutTimer);
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
