/**
 * Gender Context — builds gender-aware instructions for gendered languages.
 *
 * Many languages (Hebrew, Arabic, French, Spanish, etc.) conjugate verbs
 * and adjectives by gender. This module provides:
 *
 * - isGenderedLanguage(lang) — checks if a language needs gender context
 * - buildGenderInstructions({ language, agentGender, targetGender }) — returns
 *   a [GENDER CONTEXT] block for system prompts (empty for non-gendered languages)
 * - getAgentGender(db, agentId) — DB lookup, defaults to "male"
 */

import { logger } from "./logger.js";

export type AgentGender = "male" | "female" | "neutral";
export type TargetGender = "male" | "female" | "unknown";

/**
 * Languages that conjugate verbs/adjectives by gender.
 * Keyed by BCP-47 base language code (lowercase).
 */
const GENDERED_LANGUAGES = new Set([
  "he", // Hebrew
  "ar", // Arabic
  "fr", // French
  "es", // Spanish
  "pt", // Portuguese
  "it", // Italian
  "de", // German
  "ru", // Russian
  "pl", // Polish
  "hi", // Hindi
]);

/**
 * Check if a language requires gender context for correct conjugation.
 * Accepts BCP-47 codes like "he-IL", "fr-FR", or bare "he", "fr".
 */
export function isGenderedLanguage(lang: string): boolean {
  if (!lang) return false;
  const base = lang.split("-")[0].toLowerCase();
  return GENDERED_LANGUAGES.has(base);
}

/**
 * Build a [GENDER CONTEXT] instruction block to append to system prompts.
 * Returns empty string for non-gendered languages (English, Chinese, Japanese, etc.).
 */
export function buildGenderInstructions(params: {
  language: string;
  agentGender: AgentGender;
  targetGender: TargetGender;
}): string {
  const { language, agentGender, targetGender } = params;

  if (!isGenderedLanguage(language)) return "";

  const agentLabel =
    agentGender === "male" ? "masculine" :
    agentGender === "female" ? "feminine" :
    "gender-neutral";

  const targetLabel =
    targetGender === "male" ? "masculine" :
    targetGender === "female" ? "feminine" :
    "unknown";

  const targetInstruction =
    targetGender === "unknown"
      ? "The gender of the person you are speaking to is unknown. Default to masculine conjugation, but adapt if they indicate their gender."
      : `The person you are speaking to uses ${targetLabel} conjugation. Address them accordingly.`;

  return `\n\n[GENDER CONTEXT]\nYou (the AI agent) use ${agentLabel} conjugation when referring to yourself.\n${targetInstruction}\nApply correct gender conjugation to all verbs, adjectives, and pronouns in ${language}.`;
}

/**
 * Look up the agent's gender from the database.
 * Returns "male" as default if not set or on error.
 */
export function getAgentGender(db: { query: Function }, agentId: string): AgentGender {
  try {
    const rows = db.query(
      "SELECT agent_gender FROM agent_channels WHERE agent_id = ?",
      [agentId],
    ) as Array<{ agent_gender: string | null }>;
    if (rows.length > 0 && rows[0].agent_gender) {
      const val = rows[0].agent_gender as AgentGender;
      if (val === "male" || val === "female" || val === "neutral") return val;
    }
  } catch {
    // Column might not exist yet — safe to ignore
  }
  return "male";
}
