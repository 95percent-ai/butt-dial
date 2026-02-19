/**
 * LLM Adapter — plug-and-play interface for LLM completions.
 *
 * Auto-detects provider from existing config:
 *   - ANTHROPIC_API_KEY → Anthropic (Claude Haiku)
 *   - OPENAI_API_KEY → OpenAI (gpt-4o-mini)
 *   - SANDBOX_LLM_ENDPOINT → any OpenAI-compatible API (Ollama, LM Studio, Together, Groq, etc.)
 *
 * Uses raw fetch() — no new dependencies.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

export interface LlmCompletionResult {
  text: string;
  provider: string;
}

/**
 * Check if any LLM provider is available.
 */
export function isLlmAvailable(): boolean {
  return !!(config.sandboxLlmEndpoint || config.anthropicApiKey || config.openaiApiKey);
}

/**
 * Generate a completion using the best available LLM provider.
 * Returns null if no provider is configured or the call fails.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 150,
): Promise<LlmCompletionResult | null> {
  // Priority: custom endpoint → Anthropic → OpenAI
  if (config.sandboxLlmEndpoint) {
    return callOpenAiCompatible(config.sandboxLlmEndpoint, system, user, maxTokens);
  }
  if (config.anthropicApiKey) {
    return callAnthropic(system, user, maxTokens);
  }
  if (config.openaiApiKey) {
    return callOpenAi(system, user, maxTokens);
  }
  return null;
}

async function callAnthropic(
  system: string,
  user: string,
  maxTokens: number,
): Promise<LlmCompletionResult | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropicApiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      logger.warn("llm_adapter_anthropic_error", { status: res.status });
      return null;
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    return { text, provider: "anthropic" };
  } catch (err) {
    logger.warn("llm_adapter_anthropic_failed", { error: String(err) });
    return null;
  }
}

async function callOpenAi(
  system: string,
  user: string,
  maxTokens: number,
): Promise<LlmCompletionResult | null> {
  return callOpenAiCompatible("https://api.openai.com/v1", system, user, maxTokens, config.openaiApiKey);
}

async function callOpenAiCompatible(
  endpoint: string,
  system: string,
  user: string,
  maxTokens: number,
  apiKey?: string,
): Promise<LlmCompletionResult | null> {
  try {
    // Normalize endpoint — remove trailing slash, ensure /chat/completions
    let url = endpoint.replace(/\/+$/, "");
    if (!url.endsWith("/chat/completions")) {
      url += "/chat/completions";
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      logger.warn("llm_adapter_openai_error", { status: res.status, url });
      return null;
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    const provider = endpoint.includes("openai.com") ? "openai" : "custom";
    return { text, provider };
  } catch (err) {
    logger.warn("llm_adapter_openai_failed", { error: String(err) });
    return null;
  }
}
