<!-- version: 3.1 | updated: 2026-02-15 -->

# Decisions Log

## DEC-001: Identity Model — Configurable, Dedicated as Default
**Date:** 2026-02-12
**What:** The MCP server supports three identity modes: dedicated (own number per agent), shared pool (agents share numbers with routing), and hybrid (shared default, dedicated upgrade). The connected system selects the mode at setup.
**Why:** Different deployments have different scale/cost needs. A 5-agent shop wants dedicated identity. A 1000-agent platform wants shared pool. Making this configurable avoids baking in assumptions.
**Default:** Dedicated per agent.
**Alternatives considered:** Hard-coding one mode. Rejected — limits the product's market.

## DEC-002: WhatsApp Strategy — Always Pool, Size Configurable
**Date:** 2026-02-12
**What:** WhatsApp always uses a pre-provisioned sender pool. Pool size is configurable (default: 5 for MVP). ISV Tech Provider is the scale roadmap.
**Why:** WhatsApp can never be provisioned instantly (Meta review required). A pool is always needed regardless of identity mode. Making pool size configurable keeps MVP lean while supporting growth.
**Alternatives considered:** On-demand registration (too slow), tied to identity mode (unnecessary complexity).

## DEC-003: Tenant Isolation — All Three Modes, Configurable
**Date:** 2026-02-12
**What:** Build all three isolation modes from the start: single account + DB routing, subaccount per agent, subaccount per customer. Configurable at setup time.
**Why:** Legal, commercial, and technical implications of isolation aren't settled yet. Building all three now keeps options open. The connected system or deployer chooses based on their business model.
**Alternatives considered:** MVP with single account only. Rejected — user wanted all modes built now.

## DEC-004: Voice Architecture — Both Live and Pre-recorded
**Date:** 2026-02-12
**What:** The server supports both live AI voice calls (ConversationRelay) and pre-recorded TTS voice messages from the start.
**Why:** Both serve different use cases (live conversations vs notifications/reminders). Both are in the project scope.
**Alternatives considered:** Pre-recorded only for MVP. Rejected — live voice is a core feature.

## DEC-005: Conversation Threading — Unified (Twilio Conversations API)
**Date:** 2026-02-12
**What:** All channels (SMS, WhatsApp, voice transcripts) are merged into one unified thread per contact using the Twilio Conversations API.
**Why:** Critical for agent context. If a user texts on WhatsApp then calls, the agent needs the full conversation history in one place.
**Alternatives considered:** Per-channel threads (simpler but breaks context continuity).

## DEC-006: Cost Model — Full Tracking + Tier Enforcement + Configurable Markup
**Date:** 2026-02-12
**What:** Three billing layers: (1) per-action cost tracking for every action, (2) configurable tier/quota enforcement to control limits and prevent misuse, (3) configurable markup percentage as a revenue stream for the deployer.
**Why:** Cost tracking prevents abuse. Tier enforcement controls spend. Markup enables the deployer to monetize the communication layer. All three are needed for a commercial product.
**Alternatives considered:** Track-only without enforcement. Rejected — enforcement is needed for abuse prevention.

## DEC-007: Media Handling — Configurable with Quotas
**Date:** 2026-02-12
**What:** Default to pass-through (forward provider's temporary URL). Agent owner can opt-in to persistent storage with configurable retention period (in days). System-level storage quotas control costs.
**Why:** Privacy-first approach — don't store media unless explicitly requested. Retention periods and quotas prevent unbounded storage costs. Aligns with the privacy architecture in the spec.
**Alternatives considered:** Always store (storage cost concern), always pass-through (URLs expire, breaks context).

---

## DEC-008: Default Provider Stack for Phase 0
**Date:** 2026-02-12
**What:** Default stack: Twilio (telephony), Resend (email), ElevenLabs (TTS, with WAPI as alternative), Neon (database). TTS provider (ElevenLabs vs WAPI) is selectable per customer account.
**Why:** Twilio is the only platform covering full dynamic provisioning. Resend has better DX than SendGrid. Neon is Postgres (schema works unchanged) and cheaper than Supabase. ElevenLabs is native to ConversationRelay for easiest POC, WAPI is cheaper at scale.
**Alternatives considered:** Supabase (pricier), Convex (needs schema rewrite), SendGrid (worse DX), Turso (SQLite, needs schema adaptation).

## DEC-009: Development Philosophy — Shallow First
**Date:** 2026-02-12
**What:** Build order restructured from "deep per layer" to "infrastructure → small wins → MVP → features." Every phase ends with a verification step. Never go deep before proving the foundation works.
**Why:** Original plan built all of security before sending a single SMS. New plan proves each capability end-to-end before layering. Reduces risk of investing time in the wrong direction.

## DEC-010: WhatsApp — GreenAPI for Dev, Twilio Pool for Production
**Date:** 2026-02-12
**What:** Use GreenAPI as the immediate WhatsApp provider (no Meta verification needed). Add Twilio WhatsApp with pool strategy once Meta Business Verification is confirmed. Both are adapters behind `ITelephonyProvider`.
**Why:** GreenAPI is instant setup — connects via WhatsApp Web, no approval process. Twilio WhatsApp requires Meta Business Verification (5-20 days). Using GreenAPI for development unblocks WhatsApp work immediately while the Twilio pool path is prepared in parallel.
**Risk:** GreenAPI uses WhatsApp Web protocol (not official Business API). Fine for dev/testing, compliance risk at production scale.

## DEC-011: TTS — Edge TTS for Dev, ElevenLabs/WAPI for Production
**Date:** 2026-02-12
**What:** Use Edge TTS (Microsoft, free) as the default TTS during development. ElevenLabs and WAPI are production options selectable per customer. All behind the same `ITTSProvider` interface.
**Why:** ElevenLabs costs money for every API call. Edge TTS is completely free with good quality — ideal for development and testing the voice pipeline without burning credits. Swap to ElevenLabs/WAPI for production via config.

## DEC-012: Start Lean — Only Set Up Providers When Their Phase Arrives
**Date:** 2026-02-12
**What:** Phase 0 only requires verifying existing credentials (Twilio, ElevenLabs). SQLite for local DB. New provider signups (Resend, Neon, GreenAPI) happen at the phase that needs them.
**Why:** Aligns with "small wins" philosophy. Don't set up infrastructure you won't use for weeks. Reduces Phase 0 to credential verification only.

---

## DEC-013: Setup UI — Test = Save, Deploy Button Restarts Server
**Date:** 2026-02-13
**What:** The setup page at `/admin/setup` auto-saves credentials when a "Test Connection" succeeds (no separate Save button). A "Deploy" button restarts the server so new `.env` values take effect. The server spawns a replacement process before exiting; the page polls `/health` until it's back.
**Why:** Fewer clicks. If credentials pass the test, they're valid — save immediately. A Deploy button avoids asking the user to manually restart after config changes.
**Alternatives considered:** Separate Save button (extra step for no benefit). Hot-reload config without restart (complex, risk of partial state).

## DEC-014: Testing Policy — Dry Run First, Live Only When Crucial
**Date:** 2026-02-13
**What:** Always test with static/mock data first. Never call live APIs (Twilio, ElevenLabs, etc.) unless it's the final step and real connectivity is needed to proceed. The setup UI "Test Connection" is the one exception — it's an explicit user action to verify real credentials.
**Why:** Saves API credits, avoids side effects, prevents accidental charges during development. Production keys are installed early but used late.
**Rule:** dry test with static data → fix → verify → only then live test when crucial.

---

## Architectural Theme

## DEC-015: Inbound Webhook Uses Double Validation (agentId + phone_number)
**Date:** 2026-02-14
**What:** The inbound SMS webhook at `POST /webhooks/:agentId/sms` validates that both the `agentId` from the URL path AND the `To` phone number from the Twilio body match the same agent record. The webhook returns 404 if neither matches.
**Why:** Prevents routing errors where a webhook URL is misconfigured to point at the wrong agent. The URL provides the agent context, the phone number confirms it. Both must agree.
**Alternatives considered:** Match by phone number only (simpler, but a single number could theoretically be reused). Match by agentId only (no phone verification).

## DEC-016: Voice Message Uses Inline TwiML with Local Audio Storage
**Date:** 2026-02-14
**What:** The `comms_send_voice_message` tool generates audio via TTS, stores it locally in a `storage/` directory served by Express at `/storage/{key}`, and places a Twilio call with inline TwiML (`<Play>` pointing to the audio URL). `MakeCallParams` accepts optional `twiml` as an alternative to `webhookUrl`.
**Why:** Inline TwiML is simpler than hosting a separate webhook endpoint for call instructions. Local storage avoids needing S3/R2 for dev. The audio URL must be publicly accessible (ngrok in dev, real domain in production) so Twilio can fetch it when the call connects.
**Alternatives considered:** Webhook-based TwiML (more complex, needed for Phase 5 live calls but overkill here). Base64 audio in TwiML (not supported by Twilio). External storage (S3/R2 — adds provider dependency for Phase 4).

---

## DEC-017: Email Provider — Resend (Not SendGrid)
**Date:** 2026-02-14
**What:** Phase 6 uses Resend as the email provider instead of SendGrid (which the original TODO referenced). The `comms_send_message` tool now supports `channel: "email"` alongside SMS. Inbound emails arrive via Resend webhook at `/webhooks/:agentId/email`.
**Why:** SendGrid dropped its free tier in May 2025. Resend offers 3,000 emails/month free (100/day), simple REST API (no SDK needed), and better DX. The adapter is behind `IEmailProvider` — swapping to another provider later is straightforward.
**Alternatives considered:** SendGrid (no free tier), AWS SES (complex setup), Mailgun (less generous free tier).

## DEC-018: Email Channel — Double Validation Mirrors SMS Pattern
**Date:** 2026-02-14
**What:** The inbound email webhook validates both `agentId` from the URL and `to` (email address) from the payload match the same agent record — same double-validation pattern as the SMS webhook (DEC-015).
**Why:** Consistency. Prevents routing errors where a webhook URL points to the wrong agent.

---

## DEC-019: Provisioning — Single-Account Only (No Subaccounts Yet)
**Date:** 2026-02-15
**What:** Phase 8 provisioning operates in single Twilio account mode only. No subaccount creation.
**Why:** Simplest path. Subaccount support can be added later without changing the tool interface.
**Alternatives:** Per-agent subaccounts (more isolation, more complexity), per-customer subaccounts (deferred).

## DEC-020: A2P 10DLC Deferred to Phase 17
**Date:** 2026-02-15
**What:** A2P 10DLC registration is not part of provisioning. Deferred to Phase 17 (Compliance).
**Why:** 1-2 week async approval process. It's a compliance concern, not a provisioning concern.

## DEC-021: WhatsApp Pool Empty = Soft Fail
**Date:** 2026-02-15
**What:** If the WhatsApp pool is empty during provisioning, the agent is still created — WhatsApp status is set to "unavailable" instead of failing the entire provision.
**Why:** Some agents don't need WhatsApp. Blocking provision on an empty pool would be too restrictive.

## DEC-022: Provisioning Rollback on Failure
**Date:** 2026-02-15
**What:** If any step fails during provisioning, all allocated resources are released (phone number, WhatsApp pool slot, agent row).
**Why:** Partial provisioning is not allowed. All-or-nothing prevents orphaned resources.

## DEC-023: Provider Registration — No Hot-Reload
**Date:** 2026-02-15
**What:** `comms_register_provider` saves credentials to `.env` but requires server restart. No hot-reload.
**Why:** Hot-reload adds complexity. Restart is simple and reliable. Hot-reload is a future feature.

## DEC-024: Agent Row Created Before WhatsApp Pool Assignment
**Date:** 2026-02-15
**What:** During provisioning, the `agent_channels` row is inserted before the WhatsApp pool entry is assigned. The row is then updated with WhatsApp info.
**Why:** SQLite foreign key constraint on `whatsapp_pool.assigned_to_agent` references `agent_channels.agent_id`. The agent must exist first.

---

## Architectural Theme

All 7 decisions follow a pattern: **make it configurable, with sensible defaults.** The MCP server is a standalone product that different systems connect to. It can't assume one deployment model. The connected system (AgentOS, third-party platform, etc.) configures identity, isolation, billing, media, and other behaviors at setup time.

---

## DEC-025: Auth Mechanism — Bearer Token (Not JWT)
**Date:** 2026-02-15
**What:** Agent authentication uses simple bearer tokens (32 random bytes, SHA-256 hashed in DB). Not JWTs.
**Why:** Simpler, instantly revocable via DB update (no expiration management), no token parsing needed. Plaintext returned once at provisioning, stored only as hash.
**Alternatives considered:** JWT (complex, requires expiration + refresh flow), OAuth2 (overkill for MVP).

## DEC-026: Master Token from .env
**Date:** 2026-02-15
**What:** A `MASTER_SECURITY_TOKEN` in `.env` serves as the admin credential. It can access any agent and perform admin-only operations.
**Why:** Solves the chicken-and-egg problem — you need a token before any agent exists. Admin sets it in `.env`, uses it to provision agents, agents get their own tokens.

## DEC-027: Auth Interception — Express Middleware on POST /messages
**Date:** 2026-02-15
**What:** Bearer token validation happens in Express middleware on `POST /messages`. The middleware sets `req.auth`, which the MCP SDK natively reads and passes as `extra.authInfo` to every tool callback.
**Why:** Cleanest integration path — the MCP SDK already supports `req.auth`. No custom transport or SDK patches needed.

## DEC-028: Demo Mode Skips All Auth
**Date:** 2026-02-15
**What:** When `DEMO_MODE=true`, the auth middleware sets dummy admin credentials and skips all checks. All existing tests continue to pass unchanged.
**Why:** Matches the existing demo mode pattern. Zero friction for development.

## DEC-029: Input Sanitizer — Utility Function, Not Middleware
**Date:** 2026-02-15
**What:** Input sanitization is a utility function (`sanitize()`) called explicitly inside tool callbacks, not a global Express middleware.
**Why:** Precise control over which fields to check. Not all tool inputs need sanitization (e.g., boolean flags, enum values). Tools call it on specific string fields.

## DEC-030: Webhook Signatures — Per-Route Express Middleware
**Date:** 2026-02-15
**What:** Twilio and Resend webhook signature verification is done as per-route Express middleware. Twilio uses HMAC-SHA1, Resend uses Svix HMAC-SHA256. Both skip in demo mode.
**Why:** Each provider has a different verification method. Per-route middleware keeps it clean. Graceful degradation — if no auth token/secret configured, logs a warning and continues.

## DEC-031: Credential Encryption — AES-256-GCM
**Date:** 2026-02-15
**What:** Provider credentials are encrypted using AES-256-GCM before storage in the `provider_credentials` table. Each record gets a unique random IV. Key from `CREDENTIALS_ENCRYPTION_KEY` in `.env`.
**Why:** Authenticated encryption prevents both reading and tampering. Unique IV per record prevents pattern analysis. Optional — only encrypts if key is configured.

## DEC-032: SSE Endpoint Not Authenticated
**Date:** 2026-02-15
**What:** The `GET /sse` endpoint (SSE connection) is not authenticated. Only `POST /messages` (tool calls) requires a token.
**Why:** SSE is server→client only (event stream). You can't call tools without `POST /messages`. Sufficient for MVP. Adding SSE auth later is backwards-compatible.

## DEC-033: Master Token Required — Warn, Don't Crash
**Date:** 2026-02-15
**What:** If `MASTER_SECURITY_TOKEN` is not set and `DEMO_MODE=false`, the server logs a warning but still starts. Tool calls pass through without auth checks.
**Why:** Graceful degradation for development. Don't break existing dev workflows. The warning is visible enough to catch in production.

## DEC-034: Rate Limit Source — Query usage_logs Table
**Date:** 2026-02-15
**What:** Rate limit checks query the `usage_logs` table directly (counting recent rows) rather than maintaining in-memory counters or a separate rate_limits table.
**Why:** Simple, survives restarts, sufficient at MVP scale with SQLite. No state management needed.
**Alternatives considered:** In-memory sliding window (lost on restart), Redis (external dependency), separate counters table (more complexity).

## DEC-035: Spending Windows — Calendar Day/Month UTC
**Date:** 2026-02-15
**What:** Daily and monthly spending caps use calendar day and calendar month boundaries in UTC, not rolling 24h/30d windows.
**Why:** Simpler to understand and implement. SQLite date functions work naturally with calendar boundaries. Rolling windows add complexity without clear benefit at MVP scale.

## DEC-036: Contact Frequency — Derived from usage_logs
**Date:** 2026-02-15
**What:** Contact frequency limits (max calls per day to the same number) are checked by querying `usage_logs` filtered by agent + target + action type, rather than maintaining a separate `contact_frequency` table.
**Why:** Same data, one table, simpler. Eliminated a planned table from the schema.

## DEC-037: Demo Mode + Admin Skip Rate Limits
**Date:** 2026-02-15
**What:** Rate limiting is skipped entirely in demo mode and for admin (master token) requests. Same pattern as auth guards.
**Why:** Zero friction for development and admin operations. Matches the established auth pattern.

## DEC-038: Metrics — Plain Map, No Library
**Date:** 2026-02-15
**What:** Metrics use `Map<string, number>` with text formatting, no Prometheus client library.
**Why:** Zero deps. Prometheus text format is trivially simple (`name value\n`). Counters reset on restart, which is acceptable at MVP scale since Prometheus scrapes frequently.
**Alternatives:** prom-client npm package (rejected — unnecessary dependency for simple counters).

## DEC-039: Audit Log — SHA-256 Hash Chain
**Date:** 2026-02-15
**What:** Each audit_log row stores `prev_hash` (previous row's hash) and `row_hash` (SHA-256 of `prev_hash|timestamp|eventType|actor|target|details`). Makes the log tamper-evident.
**Why:** Compliance requirement. Any modification to a historical row breaks the chain, which `verifyAuditChain()` detects.

## DEC-040: Alert Routing — Direct Function Call
**Date:** 2026-02-15
**What:** `sendAlert()` routes by severity synchronously (CRITICAL/HIGH → WhatsApp + log + audit; MEDIUM → log + audit; LOW → log only). No queue or worker.
**Why:** Simple for MVP. WhatsApp send failure logs and returns false — alerting never throws or breaks main flow.
**Alternatives:** Message queue (rejected — overkill for MVP). Background worker (rejected — same).

## DEC-042: Voice Calls — Agent Responds, Not the MCP Server
**Date:** 2026-02-15
**What:** The MCP server does NOT call any LLM during live voice calls. Voice transcripts are routed back to the connected third-party AI agent (via MCP client), which provides responses. The server is infrastructure only — it relays text, never generates it. Anthropic is removed as a "provider."
**Why:** The MCP server doesn't know which LLM the agent uses, and the agent has the required context (personality, history, business logic) to answer. The server calling Claude directly was wrong — it bypassed the agent's brain.
**Fallback:** When the agent is not connected or not responding, the server uses a built-in LLM (Claude) as a smart voicemail/answering machine. It apologizes, collects the caller's message and preferences (e.g. "call me back after 8am"), and stores everything with full context. When the agent reconnects, all messages are dispatched so it can decide what to do.
**Alternatives considered:** Keep Anthropic as the voice responder (rejected — violates the infrastructure-only principle, assumes Claude is the LLM).

## DEC-041: Health/Ready — DB Ping, Config Presence Only
**Date:** 2026-02-15
**What:** `/health/ready` does a real `SELECT 1` against the DB, but only checks config presence (not live API pings) for providers.
**Why:** Real API pings to Twilio/Resend would be slow and wasteful on every readiness check. Config presence is sufficient to know if providers are configured.

## DEC-043: Setup UI — Single Page Layout, Startup Warn-Not-Crash
**Date:** 2026-02-15
**What:** Setup UI is a single page with 5 provider cards (Twilio, ElevenLabs, Resend, Server Settings, Voice Defaults). No step wizard. Startup validation logs warnings for missing credentials but never crashes.
**Why:** A wizard implies a required sequence. In reality, providers are independently optional — you might configure email without voice, or run entirely in demo mode. Warnings instead of crashes let the server run in partially-configured states (dev, demo, gradual setup).
**Alternatives considered:** Multi-step wizard (rejected — forces artificial ordering), crash on missing creds (rejected — blocks development and demo mode).
