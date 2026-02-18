# Security Model

## Authentication

### Agent Tokens
Every MCP tool call requires a security token bound to an agent ID.

- Tokens are generated during provisioning (`comms_provision_channels`)
- Stored as SHA-256 hashes in `agent_tokens` table
- Passed via SSE query param: `/sse?token=<token>&agentId=<agentId>`
- Impersonation guard: token is bound to a specific agentId

### Master Token
Admin operations require a master security token.

```env
MASTER_SECURITY_TOKEN=your-secret-here
```

- Required for: `comms_set_agent_limits`, `comms_register_provider`, `comms_set_billing_config`, admin POST routes
- Passed as: `Authorization: Bearer <masterToken>`
- No master token configured = all admin routes open (dev mode)

### Demo Mode
When `DEMO_MODE=true`, all authentication is bypassed. Never use in production.

## Webhook Signature Verification

### Twilio
- Validates `X-Twilio-Signature` header using HMAC-SHA1
- Compares against expected signature computed from auth token + URL + params
- Replay prevention: in-memory nonce cache (MessageSid/CallSid), 5-minute TTL

### Resend
- Validates Svix signature headers (`svix-id`, `svix-timestamp`, `svix-signature`)
- Timestamp validation: rejects messages older than 5 minutes

## Input Sanitization

All user inputs are validated before processing:
- SQL injection patterns
- XSS (script tags, event handlers)
- CRLF / header injection
- Path traversal (`../`)
- Command injection (`;`, `|`, backticks)

Implemented in `src/security/sanitizer.ts`. Applied in every tool that accepts user input.

## Encryption

Provider credentials stored in the database are encrypted with AES-256-GCM.

```env
CREDENTIALS_ENCRYPTION_KEY=<64-char-hex-string>
```

## HTTP Security Headers

Applied to all responses (zero-dependency, no helmet):
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (strict for API, relaxed for admin UI)
- `Strict-Transport-Security` (production only)

## CORS

Configurable allowed origins:

```env
CORS_ALLOWED_ORIGINS=https://your-app.com,https://admin.your-app.com
```

- Falls back to `WEBHOOK_BASE_URL` if not set
- OPTIONS preflight returns 204
- Credentials allowed for configured origins

## Rate Limiting

### HTTP Level
Per-IP and global rate limits on all HTTP requests:

```env
HTTP_RATE_LIMIT_PER_IP=60      # requests per minute per IP
HTTP_RATE_LIMIT_GLOBAL=100     # total requests per minute
```

### MCP Tool Level
Per-agent rate limits on tool calls (see Rate Limiting docs):
- Per-minute, per-hour, per-day action counts
- Daily/monthly spending caps
- Contact frequency limits

### Brute-Force Protection
- 10 failed auth attempts → 15-minute IP lockout
- Fires HIGH severity alert on lockout
- In-memory tracking, cleanup every 60 seconds

## IP Filtering

```env
ADMIN_IP_ALLOWLIST=10.0.0.1,10.0.0.2    # Only these IPs can access /admin
WEBHOOK_IP_ALLOWLIST=                     # Empty = all allowed
IP_DENYLIST=1.2.3.4                      # Always blocked
```

Skipped in demo mode.

## Anomaly Detection

Runs every 60 seconds, checks for:
- **Volume spikes:** Actions in last 5 min > 3x previous window → MEDIUM alert
- **Brute force:** >10 failed auth per IP in 5 min → HIGH alert
- **Rapid token rotation:** >3 tokens for same agent in 1 hour → MEDIUM alert

```env
ANOMALY_DETECTOR_ENABLED=true
```

## Compliance

- **Content filtering:** Blocks threats, profanity, hate speech
- **DNC list:** Do Not Contact checking before every outbound message/call
- **TCPA:** No calls before 8 AM or after 9 PM local time
- **CAN-SPAM:** Warns if emails lack unsubscribe link
- **GDPR:** Right to erasure — deletes all data for a given identifier
- **Recording consent:** Two-party consent state detection
- **Consent enforcement:** `preSendCheck()` blocks outbound messages when no active consent exists for the agent/contact/channel
- **STOP keyword:** Inbound SMS containing "STOP", "UNSUBSCRIBE", "CANCEL", "END", or "QUIT" auto-revokes consent and adds sender to DNC list
- **Country compliance:** 37 countries with per-country rules for A2P registration, DNC checks, calling hours, recording consent. Provisioning blocked if requirements not met.
- **Data retention:** Configurable auto-purge (messages 90d, usage 365d, voicemail 30d, OTP 1d, revoked consent 730d)
- **Sandbox gating:** New organizations start in sandbox mode (mock providers). Production requires admin approval after KYC review.

## Body Size Limits

- JSON body: 1 MB max
- URL-encoded body: 1 MB max
- Requests exceeding limit get 413 Payload Too Large

## Trust Proxy

`trust proxy` is set to 1 (trust first proxy) for correct IP detection behind load balancers/reverse proxies.
