/**
 * Translation service — detects language and translates text using Anthropic API.
 *
 * - Returns original text unchanged if translation is disabled, API key missing, or languages match.
 * - All calls wrapped in try/catch — failure = pass through untranslated.
 * - Config flag: TRANSLATION_ENABLED (default: false).
 * - Reuses existing ANTHROPIC_API_KEY — no new dependencies.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Compare two BCP-47 language codes by their base language (e.g. "en-US" and "en-GB" are the same).
 * Returns true if translation is needed (languages differ).
 */
export function needsTranslation(lang1: string, lang2: string): boolean {
  if (!lang1 || !lang2) return false;
  const base1 = lang1.split("-")[0].toLowerCase();
  const base2 = lang2.split("-")[0].toLowerCase();
  return base1 !== base2;
}

/**
 * Detect the language of a text string.
 * Returns a BCP-47 language code (e.g. "en", "he", "es", "fr").
 * Returns "unknown" if detection fails or translation is disabled.
 */
export async function detectLanguage(text: string): Promise<string> {
  if (!config.translationEnabled || !config.anthropicApiKey) return "unknown";
  if (!text || text.trim().length < 3) return "unknown";

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      system: "You are a language detector. Respond with ONLY the BCP-47 language code (e.g. en, he, es, fr, ar, zh, ja, ko, ru, de, pt, it). Nothing else.",
      messages: [{ role: "user", content: `Detect the language of this text:\n\n${text}` }],
    });

    const result = response.content[0];
    if (result && result.type === "text") {
      const code = result.text.trim().toLowerCase().replace(/[^a-z-]/g, "");
      if (code.length >= 2 && code.length <= 10) {
        logger.info("language_detected", { language: code, textLength: text.length });
        return code;
      }
    }

    return "unknown";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn("language_detection_failed", { error: errMsg });
    return "unknown";
  }
}

/**
 * Translate text from one language to another.
 * Returns the original text if:
 *   - Translation is disabled or API key missing
 *   - Languages are the same (base language match)
 *   - Translation fails (graceful fallback)
 */
export async function translate(
  text: string,
  fromLang: string,
  toLang: string
): Promise<string> {
  if (!config.translationEnabled || !config.anthropicApiKey) return text;
  if (!text || text.trim().length === 0) return text;
  if (!needsTranslation(fromLang, toLang)) return text;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: `You are a translator. Translate the following text from ${fromLang} to ${toLang}. Respond with ONLY the translated text, nothing else. Preserve the tone and meaning.`,
      messages: [{ role: "user", content: text }],
    });

    const result = response.content[0];
    if (result && result.type === "text" && result.text.trim().length > 0) {
      logger.info("translation_complete", {
        fromLang,
        toLang,
        originalLength: text.length,
        translatedLength: result.text.length,
      });
      return result.text.trim();
    }

    return text;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn("translation_failed", { fromLang, toLang, error: errMsg });
    return text; // Graceful fallback — return original
  }
}

/**
 * Look up an agent's language from the DB.
 * Returns the language code or the global default.
 * Accepts a db provider to avoid circular imports.
 */
export function getAgentLanguage(db: { query<T>(sql: string, params?: unknown[]): T[] }, agentId: string): string {
  try {
    const rows = db.query<{ language: string | null }>(
      "SELECT language FROM agent_channels WHERE agent_id = ?",
      [agentId]
    );
    if (rows.length > 0 && rows[0].language) {
      return rows[0].language;
    }
  } catch {
    // DB might not have language column yet
  }
  return config.voiceDefaultLanguage;
}
