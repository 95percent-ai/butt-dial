/**
 * Documentation pages — served at /docs and /docs/:page
 * Dark theme, sidebar navigation, same CSS variables as admin/landing.
 */

// ── Page content (markdown-ish) ─────────────────────────────────────────────

const pages: Record<string, { title: string; content: string }> = {
  home: {
    title: "Butt-Dial MCP",
    content: `
# Butt-Dial MCP

**Give your AI agents a phone number.** Calls, SMS, email, and WhatsApp — one MCP server, all channels.

Butt-Dial is an open-source [MCP](https://modelcontextprotocol.io/) server that gives AI agents full communication abilities. Your agent connects via SSE, discovers tools, and starts making calls and sending messages. The server handles all the plumbing — Twilio, Resend, TTS — so your agent just talks.

## Key Features

- **Phone Calls** — Real-time AI voice conversations with ConversationRelay
- **SMS** — Two-way text messaging with full history
- **Email** — Transactional and conversational, with HTML and attachments
- **WhatsApp** — Rich messaging via WhatsApp Business
- **Pluggable Providers** — Swap Twilio for Vonage, ElevenLabs for OpenAI TTS, etc.
- **Multi-Tenant** — Per-agent billing, rate limiting, and compliance
- **Self-Hosted** — Your data, your servers. Deploy anywhere.

## Quick Start

\`\`\`bash
git clone https://github.com/elrad/butt-dial-mcp.git
cd butt-dial-mcp
npm install
cp .env.example .env
npm run build
node dist/index.js
\`\`\`

Then open http://localhost:3100/admin/setup to configure your providers.

## Demo Mode

Set \`DEMO_MODE=true\` in \`.env\` to run with mock providers. No real API calls, no costs. All tools work with simulated responses — perfect for development and testing.

## Connect Your AI Agent

\`\`\`
GET http://localhost:3100/sse?token=<agent-token>&agentId=<agent-id>
\`\`\`

Any MCP-compatible client works: Claude Desktop, Cursor, or custom orchestrators.
`,
  },

  "getting-started": {
    title: "Getting Started",
    content: `
# Getting Started

## Prerequisites

- **Node.js 22+** and npm
- **Twilio account** — for SMS, voice calls, and WhatsApp
- **Resend account** (optional) — for email
- **ElevenLabs account** (optional) — for premium TTS (free Edge TTS is the default)

## Installation

\`\`\`bash
git clone https://github.com/elrad/butt-dial-mcp.git
cd butt-dial-mcp
npm install
cp .env.example .env
\`\`\`

## Configuration

### Minimum (Demo Mode)

\`\`\`env
PORT=3100
DEMO_MODE=true
\`\`\`

Demo mode uses mock providers — no real API calls, no costs.

### Production

\`\`\`env
PORT=3100
DEMO_MODE=false

# Required for SMS/voice
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Required for email
RESEND_API_KEY=re_...

# Optional premium TTS (falls back to free Edge TTS)
ELEVENLABS_API_KEY=sk_...

# Security
MASTER_SECURITY_TOKEN=your-secret-token
WEBHOOK_BASE_URL=https://your-domain.com
\`\`\`

See \`.env.example\` for all available options.

## Build & Run

\`\`\`bash
npm run build
npm run seed    # Creates a test agent (test-agent-001)
node dist/index.js
\`\`\`

The server starts on port 3100 (default).

## Web Setup Wizard

Visit **http://localhost:3100/admin/setup** for guided configuration:

1. Enter Twilio credentials → click **Test Connection** → auto-saves on success
2. Enter ElevenLabs key → test → auto-saves
3. Enter Resend key → test → auto-saves
4. Configure server settings (webhook URL, master token)
5. Set voice defaults (greeting, language, voice ID)

Each card validates credentials live before saving.

## Verify

\`\`\`bash
curl http://localhost:3100/health
# Returns: {"status":"ok","uptime":...,"version":"0.1.0"}
\`\`\`

## Expose Webhooks (Development)

For inbound messages and calls to reach your local server, expose it publicly:

\`\`\`bash
ngrok http 3100
# Copy the HTTPS URL to WEBHOOK_BASE_URL in .env
\`\`\`

## Connect an AI Agent

Your AI agent connects via MCP over SSE:

\`\`\`
GET http://localhost:3100/sse?token=<agent-security-token>&agentId=<agent-id>
\`\`\`

- \`token\` — Security token generated during provisioning
- \`agentId\` — Registers the agent session for voice routing and message delivery

Once connected, your MCP client can list and call all available tools. See [MCP Tools](/docs/mcp-tools) for the full reference.

## Inbound Message Flow

When someone texts, emails, or calls your agent's number:

1. The server receives the webhook from Twilio/Resend
2. Validates the signature
3. Stores metadata in the database
4. Routes it to your connected agent session

For voice calls, the server relays the caller's speech as text to your agent via MCP sampling, and your agent's text response is spoken back to the caller.

## Startup Warnings

| Warning | Meaning |
|---------|---------|
| No Twilio credentials | Telephony channels use mock adapters |
| No Resend API key | Email uses mock adapter |
| Webhook URL is localhost | Inbound webhooks won't work externally |
| No master security token | Tool calls are unauthenticated |
| No ElevenLabs key | Using free Edge TTS (not an error) |
| No Anthropic key | Answering machine disabled |

These are warnings, not errors. The server always starts.
`,
  },

  "mcp-tools": {
    title: "MCP Tools",
    content: `
# MCP Tools Reference

All tools are called via the MCP protocol over SSE transport. Each tool requires authentication unless running in demo mode.

---

## comms_ping

Health check and connectivity test.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`message\` | string | No | Echo message |

\`\`\`json
{
  "status": "ok",
  "server": "agentos-comms",
  "echo": "hello",
  "pool": { "maxAgents": 5, "activeAgents": 1, "slotsRemaining": 4 },
  "providers": { "telephony": "twilio", "email": "resend", "tts": "edge-tts" }
}
\`\`\`

---

## comms_send_message

Send SMS, email, or WhatsApp message.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`to\` | string | Yes | Recipient (E.164 phone or email) |
| \`body\` | string | Yes | Message text |
| \`channel\` | enum | No | \`sms\`, \`email\`, or \`whatsapp\` (default: sms) |
| \`subject\` | string | No | Email subject (required for email) |
| \`html\` | string | No | HTML body for email |
| \`templateId\` | string | No | WhatsApp template SID |
| \`templateVars\` | object | No | Template variables |

\`\`\`json
{
  "success": true,
  "messageId": "uuid",
  "externalId": "SMxxxxxx",
  "status": "queued",
  "cost": 0.0075,
  "channel": "sms",
  "from": "+15551234567",
  "to": "+15559876543"
}
\`\`\`

Compliance checks: Content filter, DNC list, TCPA time-of-day, CAN-SPAM (email).

---

## comms_make_call

Initiate an outbound AI voice call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`to\` | string | Yes | Phone number in E.164 format |
| \`systemPrompt\` | string | No | AI instructions for this call |
| \`greeting\` | string | No | First thing the AI says |
| \`voice\` | string | No | TTS voice ID |
| \`language\` | string | No | Language code (e.g. en-US) |

\`\`\`json
{
  "success": true,
  "callSid": "CAxxxxxx",
  "sessionId": "uuid",
  "status": "queued",
  "from": "+15551234567",
  "to": "+15559876543"
}
\`\`\`

---

## comms_send_voice_message

Generate TTS audio and deliver via phone call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`to\` | string | Yes | Phone number in E.164 |
| \`text\` | string | Yes | Text to speak |
| \`voice\` | string | No | TTS voice ID |

---

## comms_get_messages

Retrieve message history for an agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`channel\` | enum | No | Filter by channel |
| \`direction\` | enum | No | inbound or outbound |
| \`limit\` | number | No | Max results (default: 50) |
| \`offset\` | number | No | Pagination offset |

---

## comms_transfer_call

Transfer a live voice call to a human or another agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`callSid\` | string | Yes | Active call SID |
| \`to\` | string | Yes | Destination phone or agent ID |
| \`announcementText\` | string | No | Text to say before transfer |

---

## comms_provision_channels

Provision phone/SMS/WhatsApp/email/voice for a new agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | New agent ID |
| \`displayName\` | string | Yes | Display name |
| \`capabilities\` | array | Yes | Channels: sms, voice, whatsapp, email |
| \`country\` | string | No | Country code for phone number |
| \`emailDomain\` | string | No | Custom email domain |

---

## comms_deprovision_channels

Tear down all channels for an agent. Releases phone number and WhatsApp pool slot.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent to deprovision |

---

## comms_get_channel_status

Check provisioning and health status of all channels for an agent.

---

## comms_onboard_customer

Full automated onboarding: provisions all channels, generates DNS records, returns setup package.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent ID |
| \`displayName\` | string | Yes | Display name |
| \`capabilities\` | array | Yes | Channels to provision |
| \`emailDomain\` | string | No | Custom email domain |
| \`greeting\` | string | No | Voice greeting |
| \`systemPrompt\` | string | No | Voice system prompt |

---

## comms_register_provider

Register or update third-party provider credentials. Admin only.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`provider\` | enum | Yes | twilio, vonage, resend, elevenlabs, openai, deepgram, s3, r2, turso, convex |
| \`credentials\` | object | Yes | Provider-specific credential fields |
| \`verify\` | boolean | No | Test before saving (default: true) |

---

## comms_set_agent_limits

Configure rate limits and spending caps. Admin only.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | Yes | Agent to configure |
| \`limits.maxActionsPerMinute\` | number | No | Per-minute burst limit |
| \`limits.maxActionsPerHour\` | number | No | Hourly limit |
| \`limits.maxActionsPerDay\` | number | No | Daily limit |
| \`limits.maxSpendPerDay\` | number | No | Daily spending cap |
| \`limits.maxSpendPerMonth\` | number | No | Monthly spending cap |

---

## comms_get_usage_dashboard

Usage statistics, costs, and rate limits per agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`agentId\` | string | No | Specific agent (omit for all, admin only) |
| \`period\` | enum | No | today, week, month, or all |

---

## comms_get_billing_summary

Billing summary with provider costs, markup, and billed costs.

---

## comms_set_billing_config

Set billing tier, markup, and billing email. Admin only.

| Tier | Actions/min | Actions/day | Spend/month |
|------|-------------|-------------|-------------|
| Free | 5 | 100 | $10 |
| Starter | 10 | 500 | $100 |
| Pro | 30 | 5,000 | $1,000 |
| Enterprise | 100 | 50,000 | $50,000 |
`,
  },

  "api-reference": {
    title: "API Reference",
    content: `
# API Reference

The server exposes both MCP (SSE) and REST endpoints.

---

## Health & Status

### GET /health

Liveness probe. Always returns 200 if the server is running.

\`\`\`json
{
  "status": "ok",
  "uptime": 123.45,
  "version": "0.1.0",
  "environment": "development",
  "demoMode": false
}
\`\`\`

### GET /health/ready

Readiness probe. Checks all provider connections. Returns 503 if any provider is down.

\`\`\`json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "telephony": "ok",
    "email": "ok",
    "tts": "ok"
  }
}
\`\`\`

### GET /metrics

Prometheus-compatible metrics in text format. See [Monitoring](/docs/monitoring) for details.

---

## MCP Transport

### GET /sse

Server-Sent Events endpoint for MCP client connections.

\`\`\`
GET /sse?token=<agent-security-token>&agentId=<agent-id>
\`\`\`

| Parameter | Description |
|-----------|-------------|
| \`token\` | Security token for authentication |
| \`agentId\` | Agent ID to register for voice routing |

### POST /messages

MCP message endpoint. Receives tool calls from connected agents.
Include \`Authorization: Bearer <token>\` header if a security token is configured.

---

## Webhooks

All webhooks are POST endpoints that receive provider callbacks. Signatures are validated on every request.

| Endpoint | Description |
|----------|-------------|
| \`POST /webhooks/:agentId/sms\` | Inbound SMS (validates X-Twilio-Signature) |
| \`POST /webhooks/:agentId/email\` | Inbound email (validates Svix signature) |
| \`POST /webhooks/:agentId/whatsapp\` | Inbound WhatsApp (validates X-Twilio-Signature) |
| \`POST /webhooks/:agentId/voice\` | Inbound voice call — returns ConversationRelay TwiML |
| \`POST /webhooks/:agentId/outbound-voice\` | Outbound call webhook |
| \`POST /webhooks/:agentId/call-status\` | Call status updates |
| \`WSS /webhooks/:agentId/voice-ws\` | Live AI voice WebSocket |

---

## Admin Endpoints

### UI Routes

| Endpoint | Description |
|----------|-------------|
| \`GET /admin/setup\` | Web-based setup wizard |
| \`GET /admin/dashboard\` | Admin dashboard (agents, costs, alerts) |
| \`GET /admin/api-docs\` | Swagger UI with interactive API explorer |

### API Routes

All POST routes require \`Authorization: Bearer <masterToken>\`.

| Endpoint | Description |
|----------|-------------|
| \`GET /admin/api/status\` | Provider configuration status |
| \`GET /admin/api/dashboard\` | Dashboard data (agents, usage, alerts) |
| \`POST /admin/api/test/twilio\` | Test Twilio credentials |
| \`POST /admin/api/test/elevenlabs\` | Test ElevenLabs credentials |
| \`POST /admin/api/test/resend\` | Test Resend credentials |
| \`POST /admin/api/save\` | Save credentials to .env |
| \`POST /admin/api/deploy\` | Restart server with new settings |

### Example

\`\`\`bash
curl -X POST http://localhost:3100/admin/api/test/twilio \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_MASTER_TOKEN" \\
  -d '{"accountSid":"AC...","authToken":"..."}'
\`\`\`
`,
  },

  providers: {
    title: "Providers",
    content: `
# Providers

Butt-Dial uses a pluggable provider architecture. Every external dependency has an abstract interface, and providers are swappable via environment variables.

## Provider Slots

| Slot | Interface | Default | Alternatives |
|------|-----------|---------|--------------|
| Telephony | ITelephonyProvider | Twilio | Vonage |
| Email | IEmailProvider | Resend | — |
| WhatsApp | IWhatsAppProvider | Twilio | — |
| TTS | ITTSProvider | Edge TTS (free) | ElevenLabs, OpenAI |
| STT | ISTTProvider | Deepgram | — |
| Voice | IVoiceOrchestrator | ConversationRelay | — |
| Database | IDBProvider | SQLite | Turso, Convex |
| Storage | IStorageProvider | Local filesystem | S3, R2 |

## Selection

Set providers via environment variables:

\`\`\`env
PROVIDER_TELEPHONY=twilio       # twilio | vonage
PROVIDER_EMAIL=resend
PROVIDER_TTS=edge-tts           # edge-tts | elevenlabs | openai
PROVIDER_STT=deepgram
PROVIDER_DATABASE=sqlite        # sqlite | turso | convex
PROVIDER_STORAGE=local          # local | s3 | r2
\`\`\`

In demo mode (\`DEMO_MODE=true\`), all providers automatically use mock adapters.

## Available Adapters

### Telephony
- **Twilio** — Full implementation: SMS, calls, transfers, number management
- **Vonage** — Full implementation via Nexmo REST APIs
- **Mock** — Simulated responses for demo/dev

### Email
- **Resend** — Send + domain verification via REST
- **Mock** — Simulated responses

### TTS (Text-to-Speech)
- **Edge TTS** — Free Microsoft TTS, no API key needed (default)
- **ElevenLabs** — Premium voices via API
- **OpenAI** — OpenAI TTS via /v1/audio/speech
- **Mock** — Returns silent WAV

### STT (Speech-to-Text)
- **Deepgram** — HTTP POST to /v1/listen
- **Mock** — Returns fixed transcription

### Database
- **SQLite** — Local file, zero setup (development default)
- **Turso** — libSQL HTTP pipeline
- **Convex** — REST-based (stub)

### Storage
- **Local** — Filesystem + Express static route (development default)
- **S3** — AWS S3 with Signature V4
- **R2** — Cloudflare R2 (wraps S3 adapter)

## Provider Interfaces

Core tools call interfaces, never vendor-specific code:

\`\`\`typescript
// ITelephonyProvider
sendSms(params: { from, to, body }): Promise<{ messageId, status, cost }>
makeCall(params: { from, to, webhookUrl }): Promise<{ callSid, status }>
transferCall(params: { callSid, to }): Promise<{ status }>
buyNumber(params: { country }): Promise<{ phoneNumber, sid }>
releaseNumber(sid: string): Promise<void>

// IEmailProvider
send(params: { from, to, subject, body }): Promise<{ messageId, status, cost }>

// ITTSProvider
synthesize(text: string, options?): Promise<{ audio: Buffer, durationMs }>

// IStorageProvider
upload(key, data, contentType): Promise<{ url, key }>
download(key): Promise<Buffer>
delete(key): Promise<void>
\`\`\`

## Adding a New Provider

1. Create adapter file in \`src/providers/\` (e.g., \`telephony-plivo.ts\`)
2. Implement the relevant interface
3. Add selection logic in \`src/providers/factory.ts\`
4. Add config fields in \`src/lib/config.ts\`
5. Add to \`comms_register_provider\` enum
`,
  },

  architecture: {
    title: "Architecture",
    content: `
# Architecture

## Overview

\`\`\`
+-----------------------------------------------------+
|               AI Agent (MCP Client)                  |
|         Claude Desktop / Cursor / Custom             |
+--------------------------+--------------------------+
                           | SSE (MCP Protocol)
                           v
+-----------------------------------------------------+
|            Butt-Dial MCP Server                      |
|                                                      |
|  +----------+  +----------+  +-----------------+    |
|  | MCP Tools |  | Webhooks |  | Admin UI        |    |
|  | (15 tools)|  | (6 routes)|  | Setup/Dashboard |    |
|  +-----+----+  +-----+----+  +-----------------+    |
|        |              |                              |
|  +-----+--------------+---------------------------+  |
|  |              Security Layer                     |  |
|  |  Auth | Sanitizer | Rate Limiter | Compliance   |  |
|  +-----+--------------------------------------+---+  |
|        |                                              |
|  +-----+--------------------------------------+---+  |
|  |         Provider Interfaces                     |  |
|  |  Telephony | Email | WhatsApp | TTS | STT | DB |  |
|  +-----+--------------------------------------+---+  |
|        |                                              |
|  +-----+--------------------------------------+---+  |
|  |         Provider Adapters                       |  |
|  |  Twilio | Resend | ElevenLabs | SQLite | S3    |  |
|  +-------------------------------------------------+  |
+-----------------------------------------------------+
\`\`\`

## Tech Stack

- **Runtime:** Node.js 22+ / TypeScript
- **MCP:** @modelcontextprotocol/sdk (SSE transport)
- **HTTP:** Express 5
- **Database:** SQLite (dev) / Postgres (production)
- **Telephony:** Twilio (default), Vonage
- **Email:** Resend
- **TTS:** Edge TTS (free), ElevenLabs, OpenAI
- **Voice:** Twilio ConversationRelay

## Data Flows

### Outbound Message
\`\`\`
Agent -> comms_send_message -> Auth -> Sanitize -> Compliance Check
  -> Rate Limit -> Provider.send() -> Log Usage -> Return Result
\`\`\`

### Inbound Message
\`\`\`
Provider Webhook -> Signature Verify -> Replay Check
  -> Parse -> Store Metadata -> Forward to Agent Callback
\`\`\`

### Live Voice Call
\`\`\`
Inbound Call -> Webhook -> ConversationRelay TwiML -> WebSocket
  -> Human speaks -> STT (by Twilio) -> Text to Agent (MCP sampling)
  -> Agent responds -> Text to Twilio -> TTS (by Twilio) -> Human hears
\`\`\`

### Answering Machine Fallback
\`\`\`
Inbound Call -> WebSocket -> Agent not connected
  -> Built-in Anthropic LLM as answering machine
  -> Collects message -> Stores voicemail
  -> Agent reconnects -> Voicemail dispatched
\`\`\`

## Key Components

| Component | Description |
|-----------|-------------|
| MCP Server | Registers tools, handles SSE transport |
| Provider Factory | Resolves config to adapter instances |
| Auth Guard | requireAgent() / requireAdmin() |
| Token Manager | Token generation, hashing, verification |
| Sanitizer | Input validation (SQL injection, XSS, etc.) |
| Rate Limiter | Per-agent action and spending limits |
| Compliance | Content filter, DNC, TCPA, CAN-SPAM, GDPR |
| Voice Sessions | In-memory store for active call configs |
| Voice WebSocket | WebSocket handler (setup/prompt/interrupt/dtmf) |
| Agent Registry | Maps agentId to MCP Server session |
| Voicemail Dispatcher | Dispatches voicemails on agent reconnect |
| Metrics | Prometheus counters and gauges |
| Audit Log | SHA-256 hash-chained event log |
| Alert Manager | Severity-routed alerts |
| Anomaly Detector | Volume spikes, brute force, rapid rotation |

## Concurrency Model

- **Stateless tool execution** — no shared in-memory state between requests
- **Provider-level parallelism** — multiple agents operate simultaneously
- **Channel independence** — SMS, voice, email, WhatsApp on separate providers
- **Database as coordination layer** — SQLite transactions for dev, Postgres for production

**Scaling path:** single-process SQLite -> multi-process Postgres -> horizontal stateless workers.

## Configuration Modes

### Identity Model
| Mode | Description |
|------|-------------|
| Dedicated (default) | Each agent gets own phone, WhatsApp, email |
| Shared Pool | Agents share a pool of numbers |
| Hybrid | Shared by default, dedicated as upgrade |

### Tenant Isolation
| Mode | Description |
|------|-------------|
| Single Account + DB Routing | One provider account, isolation in DB |
| Subaccount per Agent | Each agent gets own provider subaccount |
| Subaccount per Customer | Each tenant gets a subaccount |
`,
  },

  security: {
    title: "Security",
    content: `
# Security

## Authentication

### Three-Tier Token Model

| Token Type | Who Uses It | What It Accesses |
|------------|-------------|------------------|
| **Agent Token** | AI agents | MCP tools scoped to their agent ID |
| **Master Token** | Admins | Admin endpoints, billing, provider config |
| **Demo Mode** | Development | Everything (auth bypassed) |

### Agent Tokens

Every MCP tool call requires a security token bound to an agent ID.

- Generated during provisioning (\`comms_provision_channels\`)
- Stored as SHA-256 hashes in the \`agent_tokens\` table
- Passed via SSE: \`/sse?token=<token>&agentId=<agentId>\`
- **Impersonation guard:** token is bound to a specific agentId

### Master Token

\`\`\`env
MASTER_SECURITY_TOKEN=your-secret-here
\`\`\`

Required for admin operations. Passed as: \`Authorization: Bearer <masterToken>\`

### Demo Mode

When \`DEMO_MODE=true\`, all authentication is bypassed. **Never use in production.**

---

## Webhook Signature Verification

### Twilio
- Validates \`X-Twilio-Signature\` using HMAC-SHA1
- Replay prevention: in-memory nonce cache, 5-minute TTL

### Resend
- Validates Svix signature headers
- Rejects messages older than 5 minutes

---

## Input Sanitization

All user inputs validated: SQL injection, XSS, CRLF injection, path traversal, command injection.

---

## Encryption

Provider credentials encrypted with **AES-256-GCM**.

\`\`\`env
CREDENTIALS_ENCRYPTION_KEY=<64-char-hex-string>
\`\`\`

---

## HTTP Security Headers

| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Content-Security-Policy | Strict for API, relaxed for admin UI |
| Strict-Transport-Security | Production only |

---

## Rate Limiting

### HTTP Level

\`\`\`env
HTTP_RATE_LIMIT_PER_IP=60      # requests/min per IP
HTTP_RATE_LIMIT_GLOBAL=100     # total requests/min
\`\`\`

### MCP Tool Level

| Limit | Default |
|-------|---------|
| Per-minute burst | 10 actions/min |
| Per-hour sustained | 100 actions/hour |
| Per-day cap | 500 actions/day |
| Per-number frequency | 2 calls/day to same number |
| Daily spending | $10/day |
| Monthly spending | $100/month |

### Brute-Force Protection

10 failed auth attempts -> 15-minute IP lockout + HIGH alert.

---

## IP Filtering

\`\`\`env
ADMIN_IP_ALLOWLIST=10.0.0.1,10.0.0.2
IP_DENYLIST=1.2.3.4
\`\`\`

---

## Anomaly Detection

Runs every 60 seconds:

| Pattern | Severity |
|---------|----------|
| Actions > 3x previous window | MEDIUM |
| >10 failed auth per IP in 5 min | HIGH |
| >3 tokens for same agent in 1 hour | MEDIUM |

---

## Compliance

| Regulation | Implementation |
|------------|---------------|
| Content filtering | Blocks threats, profanity, hate speech |
| DNC list | Checked before every outbound action |
| TCPA | No calls before 8 AM or after 9 PM |
| CAN-SPAM | Warns if emails lack unsubscribe |
| GDPR | Right to erasure support |
| Recording consent | Two-party consent detection |
`,
  },

  monitoring: {
    title: "Monitoring",
    content: `
# Monitoring

## Health Checks

### Liveness: GET /health

Returns 200 if the server process is running.

\`\`\`json
{"status":"ok","uptime":123.45,"version":"0.1.0","environment":"development","demoMode":false}
\`\`\`

### Readiness: GET /health/ready

Checks all provider connections. Returns 503 if any is down.

---

## Prometheus Metrics

### GET /metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| \`mcp_messages_sent_total\` | channel | Messages sent by channel |
| \`mcp_tool_calls_total\` | tool | Tool invocations by name |
| \`mcp_rate_limit_hits_total\` | limit_type | Rate limit triggers |
| \`mcp_http_rate_limit_hits_total\` | — | HTTP rate limit triggers |
| \`mcp_webhook_received_total\` | type | Inbound webhooks by type |
| \`mcp_auth_failures_total\` | — | Authentication failures |

**Gauges:**

| Metric | Description |
|--------|-------------|
| \`mcp_active_voice_sessions\` | Current live voice calls |
| \`mcp_active_agents\` | Provisioned active agents |

---

## Structured Logging

JSON logs to stdout. Compatible with ELK, Datadog, Loki.

\`\`\`json
{"level":"info","timestamp":"2026-02-15T12:00:00Z","event":"send_message_success","agentId":"agent-001","channel":"sms"}
\`\`\`

**No PII in logs.** Only routing metadata (agent ID, channel, direction).

---

## Audit Log

Immutable append-only log with SHA-256 hash chain. Each entry links to the previous via \`prev_hash\`.

| Field | Description |
|-------|-------------|
| id | UUID |
| timestamp | ISO timestamp |
| event_type | PROVISION, DEPROVISION, AUTH_FAILURE, etc. |
| actor | Agent ID or "system" |
| target | What was affected |
| details | JSON context |
| prev_hash | Hash of previous entry |
| row_hash | SHA-256 of current entry |

Any tampering breaks the hash chain.

---

## Alert System

| Severity | Routing |
|----------|---------|
| CRITICAL | WhatsApp to admin + log |
| HIGH | WhatsApp to admin + log |
| MEDIUM | Log only |
| LOW | Log only |

### Configuration

\`\`\`env
ADMIN_WHATSAPP_NUMBER=+15551234567
ADMIN_WHATSAPP_SENDER=whatsapp:+14155238886
\`\`\`

### Alert Triggers

| Trigger | Severity |
|---------|----------|
| Rate limit exceeded | MEDIUM |
| Auth failure / brute force | HIGH |
| Anomaly detected | MEDIUM-HIGH |
| Spending approaching limit (80%) | MEDIUM |
| Provider error | HIGH |

---

## Dashboard

### GET /admin/dashboard

Web UI: system health, provider status, active agents, usage summary, recent alerts. Auto-refreshes every 30 seconds.

### GET /admin/api/dashboard

JSON API for dashboard data.
`,
  },

  "voice-calls": {
    title: "Voice Calls",
    content: `
# Voice Calls

## How It Works

The MCP server is **infrastructure only** — it relays text between the caller and your AI agent, but never generates AI responses itself. Your agent is the brain; the server is the telephone.

### Live Voice Call Flow

\`\`\`
Inbound Call
  -> Twilio webhook hits /webhooks/:agentId/voice
  -> Server returns ConversationRelay TwiML
  -> Twilio opens WebSocket to /webhooks/:agentId/voice-ws
  -> Human speaks -> Twilio STT -> Text
  -> Text sent to your AI agent (via MCP sampling)
  -> Agent responds with text
  -> Text sent to Twilio -> Twilio TTS -> Human hears
\`\`\`

Twilio handles STT and TTS. The server only passes text back and forth.

### Three Response Paths

| Path | When | What Happens |
|------|------|--------------|
| **Agent Sampling** | Agent connected via SSE | Caller's speech goes to agent via MCP |
| **Answering Machine** | Agent not connected, Anthropic key set | Built-in Claude fallback collects message |
| **Hard-coded Fallback** | Agent not connected, no key | Plays "unavailable" message |

---

## Making Outbound Calls

\`\`\`json
{
  "agentId": "my-agent",
  "to": "+15559876543",
  "greeting": "Hi, this is your AI assistant calling about your appointment.",
  "systemPrompt": "You are a friendly appointment reminder assistant."
}
\`\`\`

Once answered, a live two-way conversation begins using the same ConversationRelay flow.

---

## Answering Machine

When the AI agent is not connected (8-second timeout):

1. Apologizes to the caller on behalf of the agent
2. Asks for message and preferences (e.g., "call me back after 8 AM")
3. Stores everything as a voicemail

When the agent reconnects, voicemails are automatically dispatched.

\`\`\`env
ANTHROPIC_API_KEY=sk-ant-...    # Required for answering machine
\`\`\`

Without the key, callers hear a hard-coded "unavailable" message.

---

## Voice Messages (TTS)

Pre-recorded messages (not live conversations):

\`\`\`json
{
  "agentId": "my-agent",
  "to": "+15559876543",
  "text": "Reminder: your appointment is tomorrow at 3 PM."
}
\`\`\`

Generates TTS audio and delivers as a phone call.

---

## Call Transfer

\`\`\`json
{
  "agentId": "my-agent",
  "callSid": "CAxxxxxxxx",
  "to": "+15551234567",
  "announcementText": "Connecting you to a human agent now."
}
\`\`\`

---

## Voice Configuration

\`\`\`env
DEFAULT_VOICE_GREETING="Hello, how can I help you today?"
DEFAULT_VOICE_ID=EXAVITQu4vr4xnSDxMaL
DEFAULT_VOICE_LANGUAGE=en-US
\`\`\`

All settings can be overridden per call via tool parameters.

### Translation

Each agent has an operating language. When translation is enabled and the caller speaks a different language, the system translates in real-time.

\`\`\`env
TRANSLATION_ENABLED=true    # Default: false
\`\`\`

---

## Compliance

- **TCPA:** No calls before 8 AM or after 9 PM local time
- **DNC:** Do Not Contact list checked before every outbound call
- **Recording Consent:** Two-party consent state detection
- **Content Filter:** Greeting text checked before the call starts
`,
  },

  registration: {
    title: "Registration",
    content: `
# Registration

Butt-Dial includes self-service registration. Users create an account, verify their email, and get API credentials — no manual admin setup needed.

## Flow

1. Visit the landing page and click **Get Started**
2. Fill out the registration form (name, email, organization, password)
3. Receive a verification email with a 6-digit code
4. Enter the code to verify
5. Get an organization token and start using the API

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/auth/login\` | GET | Login/register page |
| \`/auth/register\` | POST | Create account |
| \`/auth/verify\` | GET/POST | Email verification |
| \`/auth/login\` | POST | Login with existing credentials |

## Email Verification

- 6-digit code sent to the user's email
- Codes expire after 15 minutes
- Requires Resend to be configured
- In demo mode, the code is shown on screen instead of emailed

## Organization Tokens

After registration, each organization gets:
- A unique **organization ID**
- An **API token** for authenticating MCP tool calls
- Access to the admin dashboard

\`\`\`
GET /sse?token=<org-token>&agentId=<agent-id>
\`\`\`

## Security

- Passwords hashed with bcrypt (cost factor 12)
- Registration rate-limited (5 attempts per IP per 15 minutes)
- Email verification required before API access
- Tokens stored as SHA-256 hashes, never plaintext
`,
  },

  integration: {
    title: "Integration Guide",
    content: `
# Integration Guide

Give your AI agent a phone number. Register, get a token, send your first message, go live.

---

## 1. Quick Start (5 Steps)

### Install & Run

\`\`\`bash
git clone https://github.com/elrad/butt-dial-mcp.git
cd butt-dial-mcp
npm install && cp .env.example .env
npm run build && node dist/index.js
\`\`\`

### Register

Visit \`http://localhost:3100/auth/login\` → **Register**. Verify with the 6-digit code (printed to console in demo mode).

### Get Your API Token

Go to \`/admin\`. Your API token is at the top of the dashboard. Click **Copy**.

### Send Your First Message

\`\`\`bash
curl -X POST http://localhost:3100/api/v1/send-message \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"test-agent-001","to":"+15559876543","body":"Hello!","channel":"sms"}'
\`\`\`

### Check the Result

\`\`\`bash
curl http://localhost:3100/api/v1/messages?agentId=test-agent-001 \\
  -H "Authorization: Bearer YOUR_TOKEN"
\`\`\`

If an LLM key is configured, you'll see a simulated reply after ~2 seconds.

---

## 2. Authentication

| Token | Who | How to Get | Accesses |
|-------|-----|------------|----------|
| **Org Token** | Developers | Registration / admin panel | Admin, provisioning |
| **Agent Token** | AI agents | Provisioning API | MCP tools, REST API |
| **Master Token** | Super-admins | \`.env\` file | Everything |

REST: \`Authorization: Bearer YOUR_TOKEN\`
MCP: \`GET /sse?token=YOUR_TOKEN&agentId=my-agent\`

---

## 3. Sandbox Mode

New accounts start in sandbox. All API calls work with mock providers — no real messages, no costs.

**LLM-Powered Replies:** If \`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, or \`SANDBOX_LLM_ENDPOINT\` is set, sandbox sends generate a simulated inbound reply after ~2 seconds. Set \`SANDBOX_LLM_ENABLED=false\` to disable.

---

## 4. REST API

All endpoints at \`/api/v1/\`. Interactive docs at \`/admin#docs\`.

\`\`\`bash
# SMS
curl -X POST /api/v1/send-message -d '{"agentId":"bot","to":"+15559876543","body":"Hi","channel":"sms"}'

# Email
curl -X POST /api/v1/send-message -d '{"agentId":"bot","to":"user@example.com","body":"Hi","channel":"email","subject":"Hello"}'

# Voice call
curl -X POST /api/v1/make-call -d '{"agentId":"bot","to":"+15559876543","greeting":"Hello!"}'

# Messages
curl /api/v1/messages?agentId=bot

# Provision agent
curl -X POST /api/v1/provision -d '{"agentId":"bot","displayName":"My Bot","capabilities":["sms","voice"]}'
\`\`\`

---

## 5. MCP Connection

\`\`\`javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(
  new URL("http://localhost:3100/sse?token=YOUR_TOKEN&agentId=my-agent")
);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({
  name: "comms_send_message",
  arguments: { agentId: "my-agent", to: "+15559876543", body: "Hello!", channel: "sms" }
});
\`\`\`

Claude Desktop / Cursor config:

\`\`\`json
{ "mcpServers": { "butt-dial": { "url": "http://localhost:3100/sse?token=TOKEN&agentId=my-agent" } } }
\`\`\`

---

## 6. Channels

| Channel | Provider | Send | Inbound | Requirements |
|---------|----------|------|---------|--------------|
| SMS | Twilio | \`channel: "sms"\` | Auto-webhook | TWILIO_ACCOUNT_SID, AUTH_TOKEN |
| Voice | Twilio | \`comms_make_call\` | Auto-webhook | Same + WEBHOOK_BASE_URL (HTTPS) |
| Email | Resend | \`channel: "email"\` | Resend dashboard webhook | RESEND_API_KEY |
| WhatsApp | Twilio | \`channel: "whatsapp"\` | Auto-webhook | Twilio WhatsApp sandbox |
| LINE | LINE API | \`channel: "line"\` | LINE Console webhook | LINE_CHANNEL_ACCESS_TOKEN |

---

## 7. Going Live

1. Add real provider credentials (Settings tab or \`.env\`)
2. Set \`DEMO_MODE=false\`
3. Set public \`WEBHOOK_BASE_URL\`
4. Provision agent with real channels
5. Real messages flow

Community/enterprise editions auto-approve accounts. SaaS requires admin review.

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| Can't connect | \`curl http://localhost:3100/health\` |
| Auth errors | Check token, or set \`DEMO_MODE=true\` |
| No inbound | Set \`WEBHOOK_BASE_URL\` to public URL |
| No sandbox replies | Set an LLM key + \`SANDBOX_LLM_ENABLED=true\` |

Full guide: \`/api/v1/integration-guide\` (raw markdown) or [docs](/docs/integration).
`,
  },

  "channel-setup": {
    title: "Channel Setup",
    content: `
# Channel Setup

Detailed setup instructions for each communication channel are in the [Channel Setup Guide](/docs/channel-setup).

For a quick overview:

| Channel | Provider | Outbound | Inbound | Two-Way |
|---------|----------|----------|---------|---------|
| SMS | Twilio | comms_send_message | Webhook auto-configured | Thread by phone number |
| Voice | Twilio | comms_make_call | Webhook auto-configured | ConversationRelay WebSocket |
| Email | Resend | comms_send_message | Webhook in Resend dashboard | Thread by email address |
| WhatsApp | Twilio | comms_send_message + templates | Webhook auto-configured | 24-hour conversation window |
| LINE | LINE Messaging API | comms_send_message | Webhook in LINE Console | User ID based |

See also:
- [MCP Tools Reference](/docs/mcp-tools) — full tool parameters
- [API Reference](/docs/api-reference) — REST endpoints
- [Voice Calls](/docs/voice-calls) — detailed voice architecture
`,
  },

  troubleshooting: {
    title: "Troubleshooting",
    content: `
# Troubleshooting

## Server

### Port already in use
**Symptom:** \`EADDRINUSE: address already in use :::3100\`
**Fix:** Kill the existing process or change \`PORT\` in \`.env\`.

### Invalid configuration
**Symptom:** \`Invalid configuration:\` followed by validation errors.
**Fix:** Check \`.env.example\` for correct format.

---

## MCP Connection

### SSE connection fails
**Symptom:** Client can't connect to \`/sse\`.
**Fix:** Verify the server is running: \`curl http://localhost:3100/health\`

### Tool calls return auth errors
**Symptom:** \`Missing or invalid security token\`
**Fix:** In demo mode, set \`DEMO_MODE=true\`. In production, pass token via SSE.

---

## Webhooks

### Inbound messages not arriving
**Fix:**
1. Expose server publicly: \`ngrok http 3100\`
2. Set \`WEBHOOK_BASE_URL\` to your ngrok URL
3. Run \`comms_provision_channels\` to configure Twilio webhooks

### Signature verification failed
**Symptom:** \`403 Forbidden\` on webhook endpoints.
**Fix:** Ensure \`TWILIO_AUTH_TOKEN\` matches your Twilio account and \`WEBHOOK_BASE_URL\` matches the URL Twilio is hitting.

### Replay detected
**Symptom:** \`403 Replay detected\`
**Fix:** Working as intended. The nonce cache prevents duplicate webhook processing.

---

## Voice Calls

### Call connects but no AI response
**Fix:** Ensure agent is connected to \`/sse?agentId=<agentId>\`. Falls back to answering machine after 8 seconds.

### ConversationRelay WebSocket errors
**Fix:** Ensure \`WEBHOOK_BASE_URL\` is publicly accessible via HTTPS. Twilio requires WSS.

---

## Rate Limiting

### HTTP 429
**Fix:** Default is 60/min per IP. Increase via \`HTTP_RATE_LIMIT_PER_IP\` or wait.

### Tool call rate limit
**Fix:** Use \`comms_set_agent_limits\` to increase limits, or wait for reset.

---

## Compliance

### Content filter block
**Fix:** Rephrase the message. The filter blocks threats and profanity.

### TCPA block
**Fix:** Wait until allowed hours (8 AM – 9 PM local time).

### DNC block
**Fix:** Remove from DNC list in the database if incorrect.

---

## Database

### Table not found
**Fix:** Server runs migrations on startup. Ensure it has started at least once.

### Database locked
**Fix:** Ensure only one server instance is running. For production, use Postgres.

---

## Admin UI

### Setup page blank
**Fix:** Check browser console. The page uses inline JS/CSS requiring relaxed CSP.

### Admin API returns 401
**Fix:** Include \`Authorization: Bearer <masterToken>\` header.

---

## Demo Mode

### Tests fail
**Fix:** Set \`DEMO_MODE=true\` in \`.env\` and restart before running tests.
`,
  },
};

// ── Sidebar definition ──────────────────────────────────────────────────────

const sidebar = [
  { section: "Getting Started", items: [
    { slug: "home", label: "Home" },
    { slug: "getting-started", label: "Getting Started" },
    { slug: "registration", label: "Registration" },
  ]},
  { section: "Reference", items: [
    { slug: "mcp-tools", label: "MCP Tools" },
    { slug: "api-reference", label: "API Reference" },
    { slug: "providers", label: "Providers" },
  ]},
  { section: "Guides", items: [
    { slug: "integration", label: "Integration Guide" },
    { slug: "channel-setup", label: "Channel Setup" },
    { slug: "voice-calls", label: "Voice Calls" },
    { slug: "architecture", label: "Architecture" },
    { slug: "security", label: "Security" },
    { slug: "monitoring", label: "Monitoring" },
  ]},
  { section: "Help", items: [
    { slug: "troubleshooting", label: "Troubleshooting" },
  ]},
];

// ── Minimal markdown-to-HTML converter ──────────────────────────────────────

function md(src: string): string {
  let html = src;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = esc(code.trimEnd());
    return `<pre><code class="lang-${lang || "text"}">${escaped}</code></pre>`;
  });

  // Tables
  html = html.replace(/((?:\|.+\|\n)+)/g, (_m, table: string) => {
    const rows = table.trim().split("\n").filter(r => r.trim());
    if (rows.length < 2) return table;
    const hdr = parseTr(rows[0]);
    const body = rows.slice(2); // skip separator row
    let t = "<table><thead><tr>" + hdr.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
    for (const row of body) {
      t += "<tr>" + parseTr(row).map(c => `<td>${inline(c)}</td>`).join("") + "</tr>";
    }
    return t + "</tbody></table>";
  });

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/((?:^- .+\n?)+)/gm, (_m, block: string) => {
    const items = block.trim().split("\n").map(l => `<li>${inline(l.replace(/^- /, ""))}</li>`);
    return `<ul>${items.join("")}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (_m, block: string) => {
    const items = block.trim().split("\n").map(l => `<li>${inline(l.replace(/^\d+\.\s*/, ""))}</li>`);
    return `<ol>${items.join("")}</ol>`;
  });

  // Paragraphs — wrap remaining bare text lines
  html = html.replace(/^(?!<[a-z/])((?:.(?!<[a-z/]))+.*)$/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    return `<p>${inline(trimmed)}</p>`;
  });

  return html;
}

function inline(s: string): string {
  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function parseTr(row: string): string[] {
  return row.split("|").slice(1, -1).map(c => c.trim());
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Page renderer ───────────────────────────────────────────────────────────

export function renderDocsPage(slug?: string): string | null {
  const pageSlug = slug || "home";
  const page = pages[pageSlug];
  if (!page) return null;

  const sidebarHtml = sidebar.map(group => {
    const items = group.items.map(item => {
      const active = item.slug === pageSlug ? ' class="active"' : "";
      return `<a href="/docs/${item.slug}"${active}>${item.label}</a>`;
    }).join("\n        ");
    return `<div class="sb-group">
        <div class="sb-heading">${group.section}</div>
        ${items}
      </div>`;
  }).join("\n      ");

  const contentHtml = md(page.content);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title} — Butt-Dial Docs</title>
  <style>
    :root {
      --bg-body: #0f1117;
      --bg-card: #161b22;
      --bg-sidebar: #13161d;
      --border: #21262d;
      --text: #d1d5db;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --success: #3fb950;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      --mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg-body);
      color: var(--text);
      line-height: 1.7;
      display: flex;
      min-height: 100vh;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    /* ── Sidebar ─────────────────────── */
    .sidebar {
      width: 260px;
      min-width: 260px;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      padding: 24px 0;
      position: fixed;
      top: 0; bottom: 0; left: 0;
      overflow-y: auto;
    }
    .sb-logo {
      padding: 0 20px 20px;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-heading);
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .sb-logo span { font-size: 22px; }
    .sb-group { margin-bottom: 20px; }
    .sb-heading {
      padding: 4px 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .sidebar a {
      display: block;
      padding: 6px 20px 6px 28px;
      font-size: 14px;
      color: var(--text-muted);
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .sidebar a:hover {
      color: var(--text-heading);
      background: rgba(88,166,255,0.06);
    }
    .sidebar a.active {
      color: var(--accent);
      border-left-color: var(--accent);
      background: rgba(88,166,255,0.08);
      font-weight: 600;
    }

    /* ── Content ─────────────────────── */
    .content {
      margin-left: 260px;
      flex: 1;
      max-width: 860px;
      padding: 40px 48px 80px;
    }

    .content h1 {
      font-size: 32px;
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .content h2 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-heading);
      margin-top: 40px;
      margin-bottom: 12px;
    }
    .content h3 {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-heading);
      margin-top: 28px;
      margin-bottom: 8px;
    }

    .content p {
      margin-bottom: 14px;
    }

    .content ul, .content ol {
      margin-bottom: 14px;
      padding-left: 24px;
    }
    .content li {
      margin-bottom: 4px;
    }

    .content hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 32px 0;
    }

    .content code {
      font-family: var(--mono);
      font-size: 13px;
      background: rgba(110,118,129,0.15);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .content pre {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      overflow-x: auto;
      margin-bottom: 16px;
    }
    .content pre code {
      background: none;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .content table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .content th {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid var(--border);
      color: var(--text-heading);
      font-weight: 600;
    }
    .content td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .content tr:hover td {
      background: rgba(88,166,255,0.04);
    }

    .content strong { color: var(--text-heading); }

    /* ── Back to top ────────────────── */
    .back-top {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    /* ── Mobile ──────────────────────── */
    .menu-toggle {
      display: none;
      position: fixed; top: 12px; left: 12px; z-index: 200;
      background: var(--bg-card); border: 1px solid var(--border);
      color: var(--text); padding: 8px 12px; border-radius: 6px;
      cursor: pointer; font-size: 18px;
    }
    @media (max-width: 768px) {
      .menu-toggle { display: block; }
      .sidebar {
        transform: translateX(-100%);
        transition: transform 0.2s;
        z-index: 150;
      }
      .sidebar.open { transform: translateX(0); }
      .content { margin-left: 0; padding: 60px 20px 80px; }
    }
  </style>
</head>
<body>
  <button class="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">&#9776;</button>

  <nav class="sidebar">
    <div class="sb-logo"><span>&#128222;</span> <a href="/docs" style="color:inherit">Butt-Dial Docs</a></div>
      ${sidebarHtml}
      <div class="sb-group">
        <div class="sb-heading">Links</div>
        <a href="/">Landing Page</a>
        <a href="/admin/setup">Admin Setup</a>
      </div>
  </nav>

  <main class="content">
    ${contentHtml}
    <div class="back-top"><a href="/docs">&#8592; Home</a></div>
  </main>

</body>
</html>`;
}

/** List of valid page slugs for route validation */
export const docsPageSlugs = Object.keys(pages);
