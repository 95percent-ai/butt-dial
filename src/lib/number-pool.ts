/**
 * Number Pool — smart outbound routing.
 *
 * Picks the cheapest phone number from a shared pool based on
 * the destination country. Same-country = cheapest path.
 */

import { logger } from "./logger.js";

// ---------- Country detection ----------

/** E.164 prefix → ISO country code. Longest prefixes first so +972 wins over +97. */
const PREFIX_MAP: [string, string][] = [
  // North America
  ["+1", "US"],

  // Europe
  ["+44", "GB"],
  ["+33", "FR"],
  ["+49", "DE"],
  ["+34", "ES"],
  ["+39", "IT"],
  ["+31", "NL"],
  ["+46", "SE"],
  ["+47", "NO"],
  ["+45", "DK"],
  ["+41", "CH"],
  ["+43", "AT"],
  ["+32", "BE"],
  ["+48", "PL"],
  ["+351", "PT"],
  ["+353", "IE"],
  ["+358", "FI"],
  ["+30", "GR"],
  ["+40", "RO"],
  ["+420", "CZ"],
  ["+36", "HU"],
  ["+380", "UA"],
  ["+7", "RU"],

  // Middle East
  ["+972", "IL"],
  ["+971", "AE"],
  ["+966", "SA"],
  ["+974", "QA"],
  ["+962", "JO"],
  ["+961", "LB"],
  ["+90", "TR"],

  // Asia-Pacific
  ["+86", "CN"],
  ["+81", "JP"],
  ["+82", "KR"],
  ["+91", "IN"],
  ["+852", "HK"],
  ["+853", "MO"],
  ["+886", "TW"],
  ["+65", "SG"],
  ["+60", "MY"],
  ["+66", "TH"],
  ["+63", "PH"],
  ["+62", "ID"],
  ["+84", "VN"],
  ["+61", "AU"],
  ["+64", "NZ"],

  // Americas
  ["+52", "MX"],
  ["+55", "BR"],
  ["+54", "AR"],
  ["+56", "CL"],
  ["+57", "CO"],

  // Africa
  ["+27", "ZA"],
  ["+234", "NG"],
  ["+254", "KE"],
  ["+20", "EG"],
];

// Sort descending by prefix length so longer prefixes are checked first
const SORTED_PREFIXES = [...PREFIX_MAP].sort((a, b) => b[0].length - a[0].length);

/**
 * Detect ISO country code from an E.164 phone number.
 * Returns "US" when no prefix matches.
 */
export function detectCountryFromPhone(phone: string): string {
  for (const [prefix, country] of SORTED_PREFIXES) {
    if (phone.startsWith(prefix)) return country;
  }
  return "US";
}

// ---------- Number selection ----------

interface PoolRow {
  id: string;
  phone_number: string;
  country_code: string;
  capabilities: string;
  is_default: number;
}

interface DbLike {
  query<T>(sql: string, params?: unknown[]): T[];
}

/**
 * Select the best outbound number from the pool for a given destination.
 *
 * Priority:
 * 1. Same-country number with matching capability
 * 2. Default number with matching capability
 * 3. Any active number with matching capability
 * 4. null (no suitable number)
 */
export function selectBestNumber(
  db: DbLike,
  destination: string,
  channel: "sms" | "voice",
  orgId = "default",
): string | null {
  const destCountry = detectCountryFromPhone(destination);

  const rows = db.query<PoolRow>(
    "SELECT id, phone_number, country_code, capabilities, is_default FROM number_pool WHERE status = 'active' AND org_id = ?",
    [orgId],
  );

  if (rows.length === 0) return null;

  // Filter to numbers that support the requested channel
  const capable = rows.filter((r) => {
    try {
      const caps: string[] = JSON.parse(r.capabilities);
      return caps.includes(channel);
    } catch {
      return false;
    }
  });

  if (capable.length === 0) return null;

  // 1. Same country
  const sameCountry = capable.find((r) => r.country_code === destCountry);
  if (sameCountry) {
    logger.info("number_pool_match", { type: "same_country", country: destCountry, number: sameCountry.phone_number });
    return sameCountry.phone_number;
  }

  // 2. Default number
  const defaultNum = capable.find((r) => r.is_default === 1);
  if (defaultNum) {
    logger.info("number_pool_match", { type: "default", country: destCountry, number: defaultNum.phone_number });
    return defaultNum.phone_number;
  }

  // 3. Any available number
  logger.info("number_pool_match", { type: "any", country: destCountry, number: capable[0].phone_number });
  return capable[0].phone_number;
}

/**
 * Resolve the outbound "from" number. Tries the pool first, then falls back
 * to the agent's own phone number. Fully backward-compatible.
 */
export function resolveFromNumber(
  db: DbLike,
  agentPhone: string | null,
  destination: string,
  channel: "sms" | "voice",
  orgId = "default",
): string | null {
  // Try pool first
  const poolNumber = selectBestNumber(db, destination, channel, orgId);
  if (poolNumber) return poolNumber;

  // Fall back to agent's own number
  return agentPhone || null;
}
