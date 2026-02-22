<!-- version: 2.2 | updated: 2026-02-22 -->

# AgentOS Communication MCP Server — Spec

## What It Is

An MCP server that gives AI agents full communication abilities across 4 channels: **phone calls, SMS, email, and WhatsApp**. Supports text, voice, images, and file attachments. Agents can communicate with humans or other AI agents. The recipient doesn't need to know if the sender is human or AI.

This is infrastructure — a communication primitive, not a chatbot.

## Standalone Product

Operates independently of AgentOS. Any MCP-compatible client (Claude Desktop, Cursor, custom orchestrators) can authenticate and use it. Requires only a valid security token and a registered agent identity.

## Context: AgentOS Layer 3 ("Hands")

Part of AgentOS by 95percent.ai. Layer 3 in the stack:
- Layer 1 ("Brain") — LLM reasoning
- Layer 2 ("Eyes") — Data retrieval
- **Layer 3 ("Hands") — This server. Communication actions.**
- Layer 4 ("Legs") — Business tool integrations

The server doesn't think or store private context. It executes communication actions and routes inbound messages back to the agent's brain.

---

## Tech Stack

**Runtime:** Node.js 22+ / TypeScript
**MCP Framework:** @modelcontextprotocol/sdk
**Transport:** HTTP/SSE (MCP standard)

### Pluggable Provider Architecture

Every external dependency uses an abstract interface. Providers are hot-swappable via configuration.

| Slot | Interface | Dev Default | Production Default | Alternatives |
|------|-----------|-------------|-------------------|--------------|
| Telephony | `ITelephonyProvider` | Twilio | Twilio | Vonage, Plivo, Telnyx |
| WhatsApp | `IWhatsAppProvider` | GreenAPI | Twilio (pool) | GreenAPI (quick setup) |
| Email | `IEmailProvider` | Resend | Resend | SendGrid, Postmark, AWS SES |
| TTS | `ITTSProvider` | Edge TTS (free) | ElevenLabs | WAPI.ai, OpenAI TTS, PlayHT |
| STT | `ISTTProvider` | Deepgram | Deepgram | Whisper, Google Speech |
| Voice Orchestration | `IVoiceOrchestrator` | Twilio ConversationRelay | Twilio ConversationRelay | Media Streams DIY, LiveKit |
| Database | `IDBProvider` | SQLite | Neon (Postgres) | Supabase, Convex, Turso |
| Object Storage | `IStorageProvider` | Local filesystem | AWS S3 | Cloudflare R2, Supabase Storage, MinIO |

Provider selection happens in `providers.config.ts`. Core tools call interfaces (`telephony.makeCall()`, `email.send()`), never vendor-specific code.

**Note:** WhatsApp is a separate interface (`IWhatsAppProvider`) rather than part of `ITelephonyProvider`, because dev (GreenAPI) and production (Twilio) WhatsApp providers have fundamentally different APIs and setup flows. This separation was introduced in DEC-010.

---

## Configuration Architecture

The MCP server is a standalone product that different systems connect to. All fundamental behaviors are **configurable at setup time** with sensible defaults. The connected system (AgentOS, third-party platform, etc.) selects its preferred mode for each setting.

### Identity Model (configurable, default: dedicated)

| Mode | Description |
|------|-------------|
| **Dedicated** (default) | Each agent gets its own phone number, WhatsApp sender, and email address. Full identity isolation. |
| **Shared Pool** | Agents share a pool of numbers with smart routing. Cheapest at scale. |
| **Hybrid** | Shared pool by default, dedicated identity as a per-agent upgrade. |

### Number Pool + Smart Routing

A shared `number_pool` table holds phone numbers tagged with country code and capabilities (SMS, voice). Outbound SMS and voice calls automatically select the best number from the pool based on the destination's country. Same-country routing = cheapest path.

**How it works:**

1. `detectCountryFromPhone(destination)` — maps E.164 prefix to ISO country code (~50 countries). Longest prefix matched first (+972 before +97). Default: US.
2. `selectBestNumber(db, destination, channel, orgId)` — routing priority:
   - Same-country number with matching capability (cheapest)
   - Default number (`is_default=1`) with matching capability
   - Any active number with matching capability
   - `null` (no suitable number in pool)
3. `resolveFromNumber(db, agentPhone, destination, channel, orgId)` — tries pool first, falls back to agent's own phone number. Fully backward-compatible: empty pool = agent's own number used.

**Transparent to AI agents** — no tool changes needed. The agent calls `comms_send_message` or `comms_make_call` as before. The server picks the optimal outbound number automatically.

**Schema:** `number_pool` table with `phone_number`, `country_code`, `capabilities` (JSON array), `is_default`, `status`, `org_id`. Indexed on `(country_code, status)`.

**Seed data:** US (+18452514056, default) and IL (+97243760273).

### WhatsApp Strategy (configurable per environment)

- **Development:** GreenAPI (instant setup, no Meta verification needed, connects via WhatsApp Web)
- **Production:** Pre-provisioned Twilio sender pool (Meta Business Verification required). Pool size is configurable (default: 5 for MVP). ISV Tech Provider Program is the scale roadmap for 100+ agents.

WhatsApp provider is selected via `PROVIDER_WHATSAPP` config (`greenapi` for dev, `twilio` for production).

### Tenant Isolation (configurable, all three modes)

| Mode | Description |
|------|-------------|
| **Single Account + DB Routing** | One provider account, all isolation in the database. Simplest. |
| **Subaccount per Agent** | Each agent gets its own provider subaccount. Hard billing isolation. |
| **Subaccount per Customer** | Each customer/tenant gets a subaccount. Agents share within it. |

### Voice Architecture

Both **live AI voice** (ConversationRelay/Media Streams) and **pre-recorded TTS messages** are supported from the start. Both serve different use cases (conversations vs notifications). TTS voice messages can be delivered via phone call or WhatsApp voice note. Email and WhatsApp both support file attachments (images, documents, audio).

### Conversation Threading

**Unified threading** via Twilio Conversations API. All channels (SMS, WhatsApp, voice transcripts) merged into one thread per contact. Critical for agent context continuity.

### Cost Model (three layers)

1. **Per-action cost tracking** — every action's cost logged and attributed to the agent
2. **Tier/quota enforcement** — configurable limits to control spend and prevent misuse
3. **Configurable markup** — deployer sets a markup percentage as a revenue stream

### Media Handling (configurable, default: pass-through)

Default to pass-through (forward provider's temporary URL). Agent owner can opt-in to persistent storage with configurable retention period (days). System-level storage quotas control costs.

---

## Concurrency Architecture

The MCP server must support an **unlimited number of concurrent communications** across all channels. The architecture is designed so that no hard ceiling limits how many simultaneous calls, messages, or sessions can be active.

Key principles:
- **Stateless tool execution** — each MCP tool call is independent. No shared in-memory state between requests that would create bottlenecks.
- **Provider-level parallelism** — multiple agents can send/receive simultaneously. The server does not serialize operations across agents.
- **No agent count ceiling** — the agent pool size is a configurable business limit, not a technical one. The architecture itself does not impose a maximum.
- **Channel independence** — SMS, voice, email, and WhatsApp operate through separate provider instances. Load on one channel does not block another.
- **Database as coordination layer** — SQLite (dev) or Postgres (production) handles concurrency via transactions. No in-process locks or global mutexes.

Scaling path: single-process SQLite for development → multi-process Postgres for production → horizontal scaling with stateless workers behind a load balancer.

---

## MCP Tools

All tool calls require a valid security token.

| # | Tool | Purpose |
|---|------|---------|
| 1 | `comms_provision_channels` | Provision phone/SMS/WhatsApp/email/voice for a new agent |
| 2 | `comms_send_message` | Send text/image/file/audio via SMS, WhatsApp, or email |
| 3 | `comms_make_call` | Initiate outbound AI voice call |
| 4 | `comms_send_voice_message` | Generate TTS voice message and deliver via phone or WhatsApp |
| 5 | `comms_get_waiting_messages` | Fetch messages that failed delivery (dead letters) — fetch = acknowledge |
| 6 | `comms_get_channel_status` | Check provisioning and health status of channels |
| 7 | `comms_deprovision_channels` | Tear down all channels, return pool slot |
| 8 | `comms_transfer_call` | Transfer live voice call to a human |
| 9 | `comms_get_usage_dashboard` | Usage stats, costs, limits per agent |
| 10 | `comms_set_agent_limits` | Configure rate limits and spending caps |
| 11 | `comms_register_provider` | Register/update third-party provider credentials |
| 12 | `comms_record_consent` | Record that a contact gave consent for a channel |
| 13 | `comms_revoke_consent` | Record that a contact revoked consent |
| 14 | `comms_check_consent` | Check current consent status for a contact/channel |

Full input/output schemas are in `docs/references/PROJECT-SCOPE.md`.

---

## Webhook Architecture

Express HTTP server for inbound webhooks:

```
POST /webhooks/:agentId/sms           → inbound SMS
POST /webhooks/:agentId/whatsapp      → inbound WhatsApp
POST /webhooks/:agentId/voice         → inbound phone call
POST /webhooks/:agentId/email         → inbound email
POST /webhooks/:agentId/call-status   → call status updates
WSS  /webhooks/:agentId/voice-ws      → live AI voice WebSocket
```

Inbound flow: validate signature → parse → store metadata → forward to agent callback.

### Route Duplication

Actions can fan out to secondary routes:
- Live call + recording simultaneously
- SMS + webhook mirror
- Email + BCC to compliance address

Primary action completes first; secondary is best-effort.

---

## Voice AI Architecture

The MCP server is infrastructure — it relays text, never generates it. The connected AI agent provides all responses.

### Live voice call flow

1. Inbound call → telephony provider hits webhook
2. Response connects to voice orchestration (e.g., ConversationRelay)
3. WebSocket handler receives/sends **text only** (orchestration handles STT/TTS)
4. Human speaks → transcribed to text → **routed back to the connected AI agent via MCP** → agent responds → response sent to Twilio → spoken to caller

The server doesn't know or care which LLM the agent uses. It only passes text back and forth.

### Fallback: smart answering machine

When the AI agent is **not connected or not responding**, the server uses a built-in LLM as an automated answering machine:

1. Apologizes to the caller on behalf of the agent
2. Collects the caller's message and preferences (e.g. "call me back after 8am")
3. Stores everything with full context — who called, when, what channel, what was said

When the agent reconnects, the server dispatches all collected messages so the agent can decide what to do. The answering machine is a fallback, not the primary responder.

The WebSocket handler is provider-agnostic — it only deals with text in/out.

---

## Agent-to-Agent Communication

Agents communicate with each other through the same channels used for humans. Agent A can call Agent B's phone number, and Agent B's voice AI picks up. The communication layer is identity-agnostic.

---

## Database

Standard SQL schema (adapted per provider). Key tables:
- `agent_channels` — channel mappings per agent (includes `blocked_channels` JSON for per-channel kill switch)
- `dead_letters` — failed/undeliverable messages (stored only on failure, auto-purged)
- `call_logs` — call records
- `whatsapp_pool` — pre-provisioned WhatsApp senders
- `agent_pool` — pool management (starts at 5 slots)
- `agent_tokens` — security token hashes
- `usage_logs` — per-action cost tracking (counts + costs, no message content)
- `spending_limits` — per-agent caps
- `provider_credentials` — encrypted provider creds
- `audit_log` — immutable event trail (hash chain)
- `contact_consent` — consent tracking per agent/contact/channel
- `country_terms_accepted` — per-country terms acceptance
- `number_pool` — shared phone numbers for smart routing
- `organizations` — multi-tenant org management (with mode: sandbox/production)
- `org_tokens` — organization-level auth tokens

Full schema in `docs/references/PROJECT-SCOPE.md`.

---

## Security

- Every tool call authenticated with security token
- Tokens are rotatable and revocable, bound to agentId (impersonation prevention)
- **Session cookies for admin UI** — email/password login sets an encrypted session cookie (`__bd_session`, AES-256-CBC). Admin middleware checks cookie before Bearer token. Users go straight to `/admin` after login/registration — no token copy-paste needed. Tokens remain for API/MCP access. (DEC-066)
- Webhook signatures validated on every inbound request
- Provider credentials encrypted at rest (AES-256)
- No PII in logs
- DDoS protection: global + per-IP rate limits, payload size caps, slowloris protection
- Input sanitization: SQL injection, XSS, header injection, path traversal, command injection prevention
- Replay attack prevention: webhook timestamps checked (5-minute window)
- Anomaly detection: volume spikes, geo anomalies, rapid token rotation, brute force
- Admin endpoints separately authenticated (session cookie or Bearer token)
- CORS + CSP headers on all responses

---

## Rate Limiting & Abuse Prevention

- Per-minute burst: 10 actions/min (default)
- Per-hour sustained: 100 actions/hour
- Per-day cap: 500 actions/day
- Per-number frequency: 2 calls/day to same number
- Spending caps: $10/day, $100/month (default)
- All limits configurable per agent
- Limits are enforced, not advisory — actions blocked when exceeded

---

## Privacy

**Stored by default:** Channel mappings, routing metadata, usage logs, rate limit counters, encrypted provider creds.

**NOT stored by default:** Message bodies, transcripts, media files, LLM prompts, PII beyond routing addresses.

**Opt-in:** Body storage (encrypted, with retention period + erasure support).

---

## Observability

1. **Health checks:** `/health` (liveness), `/health/ready` (provider connectivity)
2. **Metrics:** `/metrics` (Prometheus-compatible counters/gauges)
3. **Structured logging:** JSON format, no PII, ELK/Datadog/Loki compatible
4. **Audit trail:** Immutable append-only log with SHA-256 hash chain

---

## Admin Features

- **Session-based login** — register or log in at `/auth/login`, auto-redirected to admin panel via session cookie. Token-based login preserved for super-admins and API access.
- **WhatsApp alerts** to admin on critical events (CRITICAL/HIGH/MEDIUM/LOW severity)
- **Swagger UI** at `/admin/api-docs` — interactive API explorer
- **Setup wizard** at `/admin/setup` — 7-step guided configuration
- **Dashboard** at `/admin/dashboard` — provisioned agents, costs, alerts, channel blocking controls
- **Demo mode** (`DEMO_MODE=true`) — mock providers, no real costs

---

## Distribution Model

Three-tier distribution:

| Edition | License | Features |
|---------|---------|----------|
| **Community** | MIT (free) | All core tools (SMS, voice, email, WhatsApp, provisioning, compliance) |
| **Enterprise** | Commercial | Community + onboarding, billing, org management, priority support |
| **SaaS** | Managed | Enterprise + hosted infrastructure, auto-scaling |

Controlled via `EDITION` env var (`community` | `enterprise` | `saas`). Enterprise/SaaS-only tools are conditionally registered at startup.

## Consent Tracking

Prior consent is required before outbound contact in most jurisdictions (TCPA, GDPR, CASL).

- **`comms_record_consent`** — records consent per agent/contact/channel (express, implied, or transactional)
- **`comms_revoke_consent`** — revokes consent for a contact/channel
- **`comms_check_consent`** — checks current consent status
- **Pre-send enforcement** — `preSendCheck()` blocks messages when no active consent exists
- **STOP keyword** — inbound SMS "STOP" auto-revokes consent and adds to DNC list
- **Consent table** — `contact_consent` tracks grant/revoke lifecycle with timestamps, source, and audit trail

## Country Compliance Rules

Per-country regulatory rules engine (`country-compliance.ts`) covering 37 countries:

- **Per-country rules:** consent requirements, A2P registration, DNC checks, calling hours, recording consent, applicable regulations
- **Provisioning gating:** blocks provisioning in countries with unmet requirements (e.g., US without A2P 10DLC registration)
- **Countries covered:** US (TCPA, A2P 10DLC), CA (CASL), GB (UK GDPR, TPS), DE/FR and 25 EU states (GDPR, ePrivacy), IL, AU, JP, BR, IN, SG, AE + default rules for unknown countries

## Sandbox-to-Production Gating

Organizations start in sandbox mode and must be approved for production:

- `organizations.mode` — `sandbox` (mock providers, no real API calls) or `production` (real providers)
- KYC fields required at registration: company_name, website, use_case_description
- Account status workflow: `pending_review` → `approved` → `suspended`
- Admin review endpoints for approving/rejecting accounts (auto-upgrades org to production on approval)

## Data Retention

Configurable auto-purge per table, runs daily:

| Data | Default Retention |
|------|-------------------|
| Dead letters (acknowledged) | 7 days |
| Usage logs | 365 days |
| Call logs | 365 days |
| OTP codes | 1 day |
| Revoked consent | 730 days |

Controlled via `DATA_RETENTION_*` env vars. Can be disabled entirely with `DATA_RETENTION_ENABLED=false`.

## Compliance

- Call recording consent announcements (two-party consent jurisdictions)
- DNC list checking before outbound calls
- TCPA: consent tracking, time-of-day restrictions, opt-out handling
- GDPR: consent tracking, data minimization, right-to-erasure
- Anti-harassment: hard limits on contact frequency
- Content filtering: block hate speech, threats, abusive content
- CAN-SPAM: physical address + unsubscribe in emails
- Per-country compliance rules (37 countries)
- Consent enforcement at send time
- STOP keyword auto-processing

---

## Key Constraints

- Agent pool starts at 5 (expandable, not unbounded)
- WhatsApp is the bottleneck — use number pool strategy (pre-register senders)
- WhatsApp 24h window — templates required outside it
- US SMS requires A2P 10DLC (1-2 week registration)
- Every action has a cost — all tracked and attributed

---

## Expected Results

When complete, the server should:
1. Provision channels in <10 seconds
2. Send any message type across any channel
3. Support agent-to-agent communication
4. Route all inbound messages to correct agent
5. Handle live AI voice calls (sub-second latency)
6. Make outbound AI calls
7. Support route duplication (call + recording, etc.)
8. Allow provider swapping via config
9. Isolate agents with independent billing
10. Authenticate every action with security tokens
11. Enforce rate limits and spending caps
12. Provide real-time usage dashboard
13. Be privacy-first (no body storage by default)
14. Work standalone (any MCP client)
15. Clean teardown on deprovision
16. Full admin observability
17. WhatsApp admin alerts
18. Swagger/API explorer
19. Web-based setup wizard
20. Comprehensive documentation
21. Hardened against attacks
22. Per-agent language for voice STT/TTS (translation is the agent's responsibility)
23. Legal pages (Terms, AUP, Privacy) at /legal/*
24. Per-country compliance rules enforced at provisioning
25. Consent tracking with pre-send enforcement
26. Sandbox-to-production gating with admin approval
27. Data retention auto-purge
28. Session cookie auth for admin panel — login/register → auto-redirect to admin
