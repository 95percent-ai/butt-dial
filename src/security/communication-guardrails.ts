/**
 * Communication guardrails for AI-generated voice responses.
 *
 * Only applies to content our AI produces (answering machine, agent sampling).
 * Passthrough messages (SMS, email, WhatsApp forwarding) are NOT filtered here.
 */

import { config } from "../lib/config.js";

/** Behavioral rules prepended to every AI system prompt for voice calls */
export const COMMUNICATION_GUARDRAILS = `[COMMUNICATION GUARDRAILS — You MUST follow these rules at all times]

AI DISCLOSURE:
- You must never deny being an AI if asked directly.
- If asked "Are you a real person?", always disclose you are an AI assistant.
- Never claim to be human.
- If someone asks what you are, identify yourself as an AI assistant.

COMPOSURE:
- Stay calm and polite regardless of the caller's tone.
- Never argue, raise your voice, or show frustration.
- If the caller is upset, acknowledge their feelings and remain professional.

LEGAL SAFETY:
- Never make promises, guarantees, or legal claims.
- Never impersonate law enforcement, government officials, or medical professionals.
- Never provide legal, medical, or financial advice.
- Always clarify that you are an AI assistant if asked.

ON-TOPIC:
- Stay focused on the purpose of the call.
- Do not discuss unrelated topics, politics, religion, or personal opinions.
- If asked off-topic questions, politely redirect to the call's purpose.

BUSINESS ETHICS:
- Be honest and transparent.
- Do not use deceptive tactics, pressure, or manipulation.
- Respect the caller's time and wishes.

QUALITY:
- Use clear, professional language.
- No slang, profanity, or inappropriate humor.
- Keep responses concise — this is a phone call.

PRIVACY:
- Never share personal information about the person you represent or other callers.
- Do not repeat back sensitive data such as social security numbers, credit card numbers, or passwords.

BOUNDARIES:
- If a caller is abusive or threatening, politely say you need to end the call and do so.
- If asked to do something unethical or illegal, decline politely.

[END GUARDRAILS]
`;

/**
 * Prepend communication guardrails to a system prompt.
 * Returns the combined prompt with guardrails first, then the original instructions.
 */
export function applyGuardrails(systemPrompt: string): string {
  return COMMUNICATION_GUARDRAILS + "\n" + systemPrompt;
}

// ── Response content filter ──────────────────────────────────────────

/** Words/patterns that should never appear in AI voice responses */
const BLOCKED_PATTERNS: RegExp[] = [
  // Profanity (common English)
  /\b(?:fuck|shit|damn|ass(?:hole)?|bitch|bastard|crap|dick|piss)\b/i,
  // Slurs and hate speech markers
  /\b(?:nigger|faggot|retard|kike|spic|chink|wetback|tranny)\b/i,
  // Threats of violence
  /\b(?:i(?:'ll| will) (?:kill|hurt|harm|destroy|murder) you)\b/i,
  /\b(?:you(?:'re| are) (?:going to|gonna) (?:die|regret))\b/i,
  // Impersonation of authority
  /\b(?:i am (?:a |an )?(?:police|officer|detective|fbi|cia|dea|attorney|lawyer|doctor|nurse|physician))\b/i,
  // Leaking sensitive data patterns (SSN, credit card)
  /\b\d{3}-\d{2}-\d{4}\b/,                      // SSN format
  /\b(?:\d{4}[- ]?){3}\d{4}\b/,                  // Credit card format
];

const POLITE_FALLBACK =
  "I apologize, but I'm unable to help with that. Is there anything else I can assist you with?";

/**
 * Check AI-generated response text against content filters.
 * If any blocked pattern matches, returns allowed: false with a sanitized fallback.
 */
export function checkResponseContent(text: string): {
  allowed: boolean;
  sanitized: string;
  blockedReason?: string;
} {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        sanitized: POLITE_FALLBACK,
        blockedReason: `Matched blocked pattern: ${pattern.source}`,
      };
    }
  }

  return { allowed: true, sanitized: text };
}

/**
 * Prepend AI disclosure text to a voice call greeting.
 * FCC requires disclosure that calls are AI-generated.
 * Can be disabled via VOICE_AI_DISCLOSURE=false (transfers liability to operator).
 */
export function applyDisclosure(greeting: string): string {
  if (!config.voiceAiDisclosure) return greeting;
  return config.voiceAiDisclosureText + greeting;
}
