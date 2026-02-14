/**
 * ConversationRelay voice orchestrator.
 *
 * Generates TwiML that tells Twilio to open a ConversationRelay WebSocket.
 * Twilio handles STT (Deepgram) and TTS (ElevenLabs) — we just handle
 * the LLM logic on our WebSocket endpoint.
 */

import type { IVoiceOrchestrator } from "./interfaces.js";

export function createConversationRelayOrchestrator(): IVoiceOrchestrator {
  return {
    getConnectionTwiml(params) {
      const {
        websocketUrl,
        ttsProvider = "ElevenLabs",
        voice = "cgSgspJ2msm6clMCkdW9",
        greeting = "",
        language = "en-US",
      } = params;

      // Escape XML special characters in greeting text
      const safeGreeting = greeting
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${websocketUrl}"
      ttsProvider="${ttsProvider}"
      voice="${voice}"
      welcomeGreeting="${safeGreeting}"
      language="${language}"
      transcriptionProvider="deepgram"
      interruptible="true"
      profanityFilter="true"
      dtmfDetection="true"
    />
  </Connect>
</Response>`;
    },
  };
}
