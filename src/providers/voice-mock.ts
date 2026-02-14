/**
 * Mock voice orchestrator — returns simple <Say> TwiML for demo/dev mode.
 * No real ConversationRelay connection is made.
 */

import type { IVoiceOrchestrator } from "./interfaces.js";

export function createMockVoiceOrchestrator(): IVoiceOrchestrator {
  return {
    getConnectionTwiml(params) {
      const greeting = params.greeting || "This is a demo voice call. Goodbye.";
      const safeGreeting = greeting
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${safeGreeting}</Say>
</Response>`;
    },
  };
}
