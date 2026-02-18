/**
 * Country-specific compliance rules engine.
 * Maps ISO country codes to regulatory requirements.
 * Used during provisioning and before sending to enforce per-country guardrails.
 */

export interface CountryRule {
  code: string;
  name: string;
  /** Whether prior express consent is required before any outbound contact */
  requiresConsent: boolean;
  /** Whether A2P (application-to-person) registration is required for SMS */
  requiresA2pRegistration: boolean;
  /** Whether DNC list checking is required */
  requiresDncCheck: boolean;
  /** Calling hours restriction (local time) */
  callingHours: { start: number; end: number } | null;
  /** Key regulations that apply */
  regulations: string[];
  /** Whether recording consent announcement is required */
  requiresRecordingConsent: boolean;
  /** Whether STOP/opt-out keyword processing is mandatory */
  requiresOptOutProcessing: boolean;
  /** Additional notes for operators */
  notes: string;
}

const COUNTRY_RULES: Record<string, CountryRule> = {
  US: {
    code: "US",
    name: "United States",
    requiresConsent: true,
    requiresA2pRegistration: true,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 21 },
    regulations: ["TCPA", "CAN-SPAM", "A2P 10DLC", "STIR/SHAKEN"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "A2P 10DLC registration required for business SMS. TCPA requires prior express written consent for autodialed/prerecorded calls. Two-party consent states: CA, CT, FL, IL, MA, MD, MT, NH, OR, PA, WA.",
  },
  CA: {
    code: "CA",
    name: "Canada",
    requiresConsent: true,
    requiresA2pRegistration: true,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 21 },
    regulations: ["CASL", "PIPEDA", "CRTC DNCL"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "CASL requires express or implied consent for commercial electronic messages. CRTC National DNCL registration required for telemarketing.",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: null,
    regulations: ["UK GDPR", "PECR", "TPS"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "TPS (Telephone Preference Service) registration must be checked. PECR governs electronic marketing. UK GDPR post-Brexit.",
  },
  DE: {
    code: "DE",
    name: "Germany",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 21 },
    regulations: ["GDPR", "UWG", "TTDSG"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "Germany has strict cold-calling restrictions under UWG. Double opt-in commonly expected for email. TTDSG governs telecom privacy.",
  },
  FR: {
    code: "FR",
    name: "France",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 20 },
    regulations: ["GDPR", "Bloctel", "Code des postes"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "Bloctel is the French DNC list. Commercial calls restricted to weekdays 10:00-13:00 and 14:00-20:00 since 2023.",
  },
  IL: {
    code: "IL",
    name: "Israel",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 21 },
    regulations: ["Privacy Protection Law", "Communications Law", "DNC Registry"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "Israel DNC registry must be checked. Recording consent required. Commercial calls restricted to 8:00-21:00 Sunday-Thursday, limited on Friday/Saturday.",
  },
  AU: {
    code: "AU",
    name: "Australia",
    requiresConsent: true,
    requiresA2pRegistration: true,
    requiresDncCheck: true,
    callingHours: { start: 9, end: 20 },
    regulations: ["Spam Act 2003", "Do Not Call Register Act", "Privacy Act"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "Australian Do Not Call Register must be checked. Spam Act requires consent and identification. Telemarketing: weekdays 9am-8pm, Sat 9am-5pm.",
  },
  JP: {
    code: "JP",
    name: "Japan",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: false,
    callingHours: null,
    regulations: ["APPI", "Act on Specified Commercial Transactions"],
    requiresRecordingConsent: false,
    requiresOptOutProcessing: true,
    notes: "APPI (Act on Protection of Personal Information) governs data handling. Opt-out must be honored for commercial messages.",
  },
  BR: {
    code: "BR",
    name: "Brazil",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: { start: 8, end: 21 },
    regulations: ["LGPD", "Procon", "Anatel regulations"],
    requiresRecordingConsent: true,
    requiresOptOutProcessing: true,
    notes: "LGPD (Lei Geral de Protecao de Dados) similar to GDPR. Procon DNC lists per state. Anatel regulates telemarketing hours.",
  },
  IN: {
    code: "IN",
    name: "India",
    requiresConsent: true,
    requiresA2pRegistration: true,
    requiresDncCheck: true,
    callingHours: { start: 9, end: 21 },
    regulations: ["TRAI DND", "IT Act", "DPDP Act"],
    requiresRecordingConsent: false,
    requiresOptOutProcessing: true,
    notes: "TRAI DND (Do Not Disturb) registry is mandatory. DLT registration required for SMS senders. Telemarketing restricted 9am-9pm.",
  },
  SG: {
    code: "SG",
    name: "Singapore",
    requiresConsent: true,
    requiresA2pRegistration: false,
    requiresDncCheck: true,
    callingHours: null,
    regulations: ["PDPA", "Spam Control Act", "DNC Registry"],
    requiresRecordingConsent: false,
    requiresOptOutProcessing: true,
    notes: "PDPA DNC registry must be checked. Spam Control Act requires opt-out mechanism.",
  },
  AE: {
    code: "AE",
    name: "United Arab Emirates",
    requiresConsent: true,
    requiresA2pRegistration: true,
    requiresDncCheck: false,
    callingHours: null,
    regulations: ["TRA regulations", "Federal Decree-Law on Data Protection"],
    requiresRecordingConsent: false,
    requiresOptOutProcessing: true,
    notes: "TRA regulates all telecommunications. A2P SMS requires registered sender ID.",
  },
};

/** EU member states that share GDPR + ePrivacy baseline */
const EU_STATES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "FR"];

// Generate rules for EU states that don't have custom entries
for (const code of EU_STATES) {
  if (!COUNTRY_RULES[code]) {
    COUNTRY_RULES[code] = {
      code,
      name: code, // Will use code as name for generic EU entries
      requiresConsent: true,
      requiresA2pRegistration: false,
      requiresDncCheck: true,
      callingHours: null,
      regulations: ["GDPR", "ePrivacy Directive"],
      requiresRecordingConsent: true,
      requiresOptOutProcessing: true,
      notes: "EU member state. GDPR and ePrivacy Directive apply. Country may have additional national regulations.",
    };
  }
}

/** Default rules for countries not in the database */
const DEFAULT_RULE: CountryRule = {
  code: "DEFAULT",
  name: "Default (Unknown Country)",
  requiresConsent: true,
  requiresA2pRegistration: false,
  requiresDncCheck: false,
  callingHours: null,
  regulations: [],
  requiresRecordingConsent: false,
  requiresOptOutProcessing: true,
  notes: "No specific rules configured. Default: require consent, honor opt-out. Check local regulations.",
};

/**
 * Get compliance rules for a country.
 * Returns default rules for unknown countries.
 */
export function getCountryRules(countryCode: string): CountryRule {
  return COUNTRY_RULES[countryCode.toUpperCase()] || { ...DEFAULT_RULE, code: countryCode.toUpperCase() };
}

/**
 * Get all configured country rules.
 */
export function getAllCountryRules(): CountryRule[] {
  return Object.values(COUNTRY_RULES);
}

/**
 * Check if a country is in the EU (for GDPR purposes).
 */
export function isEuCountry(countryCode: string): boolean {
  return EU_STATES.includes(countryCode.toUpperCase());
}

/**
 * Validate that a provisioning request meets country requirements.
 * Returns a list of warnings/blockers.
 */
export function validateCountryRequirements(
  countryCode: string,
  options: {
    hasA2pRegistration?: boolean;
    hasDncListAccess?: boolean;
    hasConsentTracking?: boolean;
  } = {}
): { passed: boolean; warnings: string[]; blockers: string[] } {
  const rules = getCountryRules(countryCode);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (rules.requiresA2pRegistration && !options.hasA2pRegistration) {
    blockers.push(`${rules.name} requires A2P SMS registration before sending business messages`);
  }

  if (rules.requiresDncCheck && !options.hasDncListAccess) {
    warnings.push(`${rules.name} requires DNC list checking — ensure DNC data is loaded`);
  }

  if (rules.requiresConsent && !options.hasConsentTracking) {
    warnings.push(`${rules.name} requires prior consent before outbound communications — enable consent tracking`);
  }

  if (rules.callingHours) {
    warnings.push(`${rules.name} restricts calling hours to ${rules.callingHours.start}:00-${rules.callingHours.end}:00 local time`);
  }

  if (rules.requiresRecordingConsent) {
    warnings.push(`${rules.name} requires recording consent announcement on voice calls`);
  }

  return {
    passed: blockers.length === 0,
    warnings,
    blockers,
  };
}
