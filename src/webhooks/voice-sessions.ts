/**
 * Shared in-memory store for voice call sessions.
 *
 * When comms_make_call initiates an outbound call, it stores the call config
 * (system prompt, greeting, voice, etc.) here. The outbound-voice webhook
 * reads it back when Twilio connects the call.
 *
 * Also used by the WebSocket handler to track active conversations.
 */

export interface VoiceCallConfig {
  agentId: string;
  systemPrompt: string;
  greeting: string;
  voice: string;
  language: string;
  /** Language of the person being called (for outbound translation) */
  callerLanguage?: string;
  /** Agent's operating language (from agent_channels.language) */
  agentLanguage?: string;
  /** Force a specific voice mode, bypassing agent-connection detection */
  forceMode?: "answering-machine";
}

export interface VoiceConversation {
  agentId: string;
  callSid: string;
  from: string;
  to: string;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  abortController: AbortController | null;
  mode: "agent" | "answering-machine";
  voicemailCollected?: {
    callerMessage: string;
    callerPreferences?: string;
  };
  /** Language of the caller/called party */
  callerLanguage?: string;
  /** Agent's operating language */
  agentLanguage?: string;
}

/** Pre-call config stored by comms_make_call, read by outbound webhook */
const callConfigs = new Map<string, VoiceCallConfig>();

/** Active WebSocket conversations, keyed by callSid */
const conversations = new Map<string, VoiceConversation>();

export function storeCallConfig(sessionId: string, config: VoiceCallConfig): void {
  callConfigs.set(sessionId, config);
}

export function getCallConfig(sessionId: string): VoiceCallConfig | undefined {
  return callConfigs.get(sessionId);
}

export function removeCallConfig(sessionId: string): void {
  callConfigs.delete(sessionId);
}

export function storeConversation(callSid: string, conv: VoiceConversation): void {
  conversations.set(callSid, conv);
}

export function getConversation(callSid: string): VoiceConversation | undefined {
  return conversations.get(callSid);
}

export function removeConversation(callSid: string): void {
  conversations.delete(callSid);
}
