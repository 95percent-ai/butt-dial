/**
 * Channel Blocker — per-channel kill switch for agents.
 *
 * Stored as JSON string in agent_channels.blocked_channels:
 *   "[]"             = nothing blocked
 *   '["sms","voice"]' = those channels blocked
 *   '["*"]'          = all channels blocked
 */

const VALID_CHANNELS = new Set(["sms", "voice", "email", "whatsapp", "line"]);

/** Parse the blocked_channels JSON string. Returns empty array on null/malformed. */
export function parseBlockedChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c: unknown) => typeof c === "string");
  } catch {
    return [];
  }
}

/** Check if a specific channel is blocked (or all channels via "*"). */
export function isChannelBlocked(raw: string | null | undefined, channel: string): boolean {
  const blocked = parseBlockedChannels(raw);
  return blocked.includes("*") || blocked.includes(channel);
}

/** Validate, deduplicate, and serialize a list of channels to block. */
export function buildBlockedChannels(channels: string[]): string {
  if (!Array.isArray(channels)) return "[]";
  if (channels.includes("*")) return '["*"]';
  const unique = [...new Set(channels.filter((c) => VALID_CHANNELS.has(c)))];
  return JSON.stringify(unique);
}
