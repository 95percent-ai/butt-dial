/**
 * Input sanitizer — defense-in-depth checks for dangerous patterns.
 * DB queries already use parameterized statements; this catches obvious attack vectors early.
 */

export class SanitizationError extends Error {
  constructor(fieldName: string, reason: string) {
    super(`Invalid input for "${fieldName}": ${reason}`);
    this.name = "SanitizationError";
  }
}

// Patterns that indicate common injection attempts
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // SQL injection
  { pattern: /('|"|;)\s*(DROP|ALTER|DELETE|INSERT|UPDATE|CREATE|EXEC|UNION)\s/i, label: "SQL injection pattern" },
  { pattern: /\b(OR|AND)\s+\d+\s*=\s*\d+/i, label: "SQL tautology pattern" },
  // XSS
  { pattern: /<script[\s>]/i, label: "Script tag" },
  { pattern: /javascript\s*:/i, label: "JavaScript URI" },
  { pattern: /on(error|load|click|mouseover|focus|blur)\s*=/i, label: "Event handler injection" },
  // CRLF injection
  { pattern: /\r\n|\r|\n.*HTTP\//i, label: "CRLF injection" },
  // Path traversal
  { pattern: /\.\.[/\\]/i, label: "Path traversal" },
  // Command injection
  { pattern: /[;&|`$]\s*(rm|cat|ls|wget|curl|bash|sh|cmd|powershell)\b/i, label: "Command injection" },
];

/**
 * Check a string input for dangerous patterns.
 * Throws SanitizationError if a pattern is detected.
 */
export function sanitize(input: string, fieldName: string): string {
  if (typeof input !== "string") {
    throw new SanitizationError(fieldName, "Expected a string value");
  }

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      throw new SanitizationError(fieldName, label);
    }
  }

  return input;
}

/** Validate phone number format (E.164). */
export function sanitizePhone(input: string, fieldName: string): string {
  sanitize(input, fieldName);

  // E.164: + followed by 1-15 digits
  if (!/^\+[1-9]\d{1,14}$/.test(input)) {
    throw new SanitizationError(fieldName, "Invalid phone number format (expected E.164, e.g. +1234567890)");
  }

  return input;
}

/** Validate email address format. */
export function sanitizeEmail(input: string, fieldName: string): string {
  sanitize(input, fieldName);

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
    throw new SanitizationError(fieldName, "Invalid email address format");
  }

  return input;
}

/** Build a standard MCP error response for sanitization failures. */
export function sanitizationErrorResponse(err: unknown) {
  const message = err instanceof SanitizationError ? err.message : "Invalid input";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
