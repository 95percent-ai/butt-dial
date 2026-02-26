<!-- version: 4.8 | updated: 2026-02-26 -->

# Decisions Log

## DEC-084: Org-Level Spending Limits
**Date:** 2026-02-26
**What:** Added `max_spend_per_day` and `max_spend_per_month` columns to the `organizations` table. Org-level caps are checked before per-agent caps in the rate limiter — if the org exceeds its aggregate daily/monthly budget, all agents in that org are blocked from further actions.
**Why:** Per-agent caps alone don't prevent a rogue org from running up costs across many agents. Org-level caps give deployers an aggregate safety net.
**Alternatives considered:** Only per-agent caps (insufficient for multi-agent orgs), external billing system integration (adds dependency).

## DEC-083: Demo/Live Mode Toggle in Admin UI
**Date:** 2026-02-26
**What:** Added Operation Mode card in the Settings tab with a demo/live toggle. Switching to live shows a confirmation modal warning about real API calls and costs. On save, the `DEMO_MODE` env var is written to `.env` and the server auto-deploys (restarts).
**Why:** Previously required manual `.env` editing and server restart to switch modes. The toggle provides a safe, explicit UI action with clear warnings.
**Alternatives considered:** Environment-only toggle (no UI, error-prone), auto-detect from credentials (unreliable — credentials may be configured in demo too).

## DEC-082: Token Replaces Agent ID as User-Facing Identifier
**Date:** 2026-02-26
**What:** The security token is now the sole user-facing identifier for an agent. `agentId` is auto-generated as a UUID at provisioning — users never choose or manage it. SSE connection: `GET /sse?token=<token>` (agentId auto-resolved from agent token). All MCP tools and REST endpoints accept agentId as optional — it's auto-detected from the token. Webhook URLs still use the internal UUID (never expose the secret token in URLs). Admin UI removes the Agent ID input from the provision form and labels the token as "API Key".
**Why:** The tester found the system confusing — agent_id and token were separate concepts that users had to manage together. One credential (the token) is simpler and eliminates a class of user errors.
**Alternatives considered:** Keep agent_id user-chosen but auto-fill (still two concepts), use token in webhook URLs (security risk — tokens are secrets), remove agent_id from DB entirely (breaks webhook routing and internal references).

## DEC-081: Agent Profile Edit — Partial Update Endpoint
**Date:** 2026-02-24
**What:** New `POST /admin/api/agents/:agentId/profile` endpoint accepts partial updates for display_name, greeting, system_prompt, and voice_id. Builds SET clauses dynamically from provided fields only. Empty strings are stored as NULL.
**Why:** The agent edit panel previously only showed rate limits, channel blocking, language, and gender. Key fields (display name, greeting, system prompt, voice) were set at provisioning but couldn't be edited. This endpoint lets admins update agent personality and behavior without deprovisioning.
**Alternatives considered:** Reuse existing provisioning endpoint (too destructive), single PUT replacing all fields (requires sending all fields even if only changing one).

## DEC-080: Lazy CDN Loading — Chart.js & Swagger UI On-Demand
**Date:** 2026-02-24
**What:** Removed eager `<script>` and `<link>` tags for Chart.js (209KB), Swagger UI Bundle (1.5MB), and Swagger UI CSS (177KB). All three are now loaded on-demand via `loadScript()`/`loadCSS()` helper functions with promise caching. Chart.js loads when the Dashboard or Analytics tab activates. Swagger UI loads when the API docs section opens.
**Why:** The admin page was loading ~2MB of render-blocking CDN resources on every page load, even though most users only visit the Agents tab. Lazy loading eliminates this bottleneck — initial page load fetches zero CDN resources.
**Alternatives considered:** Self-hosting the JS/CSS (adds maintenance burden and increases deploy size), removing features (loses value), code splitting (not applicable to a single HTML page with inline JS).

## DEC-079: Provider Management System in Settings Tab
**Date:** 2026-02-23
**What:** Replaced hardcoded provider cards (Twilio, Resend, ElevenLabs/TTS) in the Settings tab with a dynamic provider management system: a table listing all connected providers with health status, active toggle, edit, and delete — plus an "Add Provider" flow with a catalog of all 11 available providers (descriptions, costs, required fields).
**Why:** The old UI only showed 3 providers as static cards. The system now supports 11 providers (Twilio, Vonage, Resend, ElevenLabs, OpenAI TTS, Edge TTS, Deepgram, Anthropic, LINE, S3, R2) with unified test/save/delete/toggle/health endpoints. Configuration cards (Voice, AI Disclosure, Email Verification, Server) stay as-is.
**Files:** New `provider-catalog.ts` (catalog data), updated `env-writer.ts` (delete/list), `credential-testers.ts` (+5 testers), `router.ts` (+7 endpoints), `config.ts`/`factory.ts` (disabled flags), `unified-admin.ts` (UI rewrite).
**Alternatives:** Could have kept adding individual cards per provider — rejected because it doesn't scale and duplicates logic.

## DEC-078: Phone-Based Admin Access — CANCELLED (Security Risk)
**Date:** 2026-02-23
**What:** Proposed granting admin access via application channels (SMS, WhatsApp) based on registered phone numbers. First registered account would be default admin; admin phone numbers would grant access via channels.
**Why cancelled:** Multiple security risks identified:
- Phone number spoofing — SMS sender IDs can be faked
- SIM swap attacks — attacker ports admin's number to their SIM
- No second factor — phone number alone is weaker than current email/password + session auth
- Expanded attack surface — every inbound webhook becomes a potential admin entry point
**Decision:** Skip this feature. Account details (phone, name) from registration are for mockup/demo testing only — not for authentication or authorization via channels. Admin access remains web-only with email/password + session cookies.
**No code changes.**

## DEC-077: Agent Channel Blocking — Per-Channel Kill Switch
**Date:** 2026-02-22
**What:** Added `blocked_channels` JSON column to `agent_channels`. Admins can block specific channels (sms, voice, email, whatsapp, line) or all channels with `["*"]` without deprovisioning the agent.
**Why:** Agents can spiral out of control — spamming a channel, getting flagged by Twilio, or running up costs. The admin needs a quick kill switch per-channel without losing the agent's configuration (phone number, email address, etc.). Deprovisioning is too destructive.
**Alternatives considered:**
- Boolean `is_blocked` flag per agent — too coarse, can't block just one channel
- Separate `blocked_channels` table — extra complexity, JSON column on the existing row is simpler
- Admin-only MCP tool — not needed, admin UI toggle + REST endpoint is sufficient

## DEC-076: Landing Page — "Orchestrate AI Agent Communication"
**Date:** 2026-02-21
**What:** Changed the landing page hero from "Open Communication Infrastructure for AI Agents" to "Orchestrate AI Agent Communication" with subtitle "Phone calls, SMS, email, WhatsApp — provisioned, routed, billed, and compliant. One server, any provider, any agent."
**Why:** The server is not just infrastructure — it actively orchestrates: routing, billing, compliance, provisioning, and failover. The new hero reflects what it does, not just what it is.

## DEC-075: Rename "Master" → "Orchestrator" Across Codebase
**Date:** 2026-02-21
**What:** Replaced all occurrences of "master" (as in master token/key) with "orchestrator" across source code, tests, docs, config, and UI. `MASTER_SECURITY_TOKEN` → `ORCHESTRATOR_SECURITY_TOKEN`. Config reads both env vars for backward compatibility (`ORCHESTRATOR_SECURITY_TOKEN || MASTER_SECURITY_TOKEN`). SQLite system references (`sqlite_master`) left unchanged.
**Why:** "Orchestrator" accurately describes the token's role — it controls the whole platform. More inclusive terminology. Aligns with the product's identity as a communication orchestrator.
**Scope:** ~40 source files, ~15 test files, ~11 doc files, `.env`, `.env.example`.

## DEC-074: SSE Endpoint Authenticated (Supersedes DEC-032)
**Date:** 2026-02-21
**What:** The `GET /sse` endpoint now requires a valid `?token=` query parameter. Same 3-tier validation as POST `/messages`: orchestrator token → org token → agent token. Agent tokens must match the `?agentId=` param. Brute-force tracking applied (10 failures → 15-min lockout). URLs sanitized in logs (`token=***`). Demo mode skips auth (same as other endpoints).
**Why:** DEC-032 left SSE open because "SSE is server→client only." But SSE connections register agents in the agent registry and receive dispatched messages. An unauthenticated SSE endpoint allowed anyone to impersonate any agent. Now closed.
**Query param vs header:** EventSource API doesn't support custom headers, so `?token=` is the standard approach. HTTPS encrypts the full URL in transit. Server logs sanitize token values.

## DEC-072: Dead Letter Queue — Store Only on Failure (Privacy-First)
**Date:** 2026-02-21
**What:** The server does NOT store messages by default. Messages are only stored when delivery fails:
- **Failed outbound** — send attempt fails → stored so the agent can retry or inform the user
- **Undeliverable inbound** — message arrives but the agent is offline/unreachable → stored until agent reconnects
- **Successful delivery = nothing stored** — if the message reaches its destination, the server holds no copy
The `messages` table is removed as a conversation store. Usage/billing stats stay in `usage_logs` (counts, costs — no message content).
**Why:** Privacy-first. Don't store what you don't need. The server is infrastructure — conversation memory belongs to the agent. Only hold messages temporarily when we can't deliver them.
**Design:** Expand `voicemail_messages` → `dead_letters` table. Covers all channels. Agent calls `comms_get_pending` on connect, acknowledges with `comms_acknowledge`. Auto-purge after TTL.
**Future:** Offer a paid "Conversation Persistence" module per agent-target pair for customers who want server-side history.
**Alternatives considered:** Store all messages then purge (unnecessary data held), inbox model storing everything until acknowledged (stores too much), no storage at all (agent loses failed messages).

## DEC-073: Remove Server-Side Translation (Agent's Responsibility)
**Date:** 2026-02-21
**What:** Remove the `targetLanguage` parameter and server-side translation from `comms_send_message` and `comms_make_call`. Translation is the agent's job, not the server's.
**Why:** AI agents already understand multiple languages natively. When an agent receives a message in Hebrew, it understands it and decides how to reply. The server knows nothing about the target's language — only the agent does from its conversation context. Server-side translation is redundant for all agent communication flows.
**Remaining use case:** Human-to-human bridged calls (call-on-behalf) where the server sits between two humans speaking different languages. For text this is feasible; for voice it requires real-time interpretation (a product, not a feature). Deferred to future.
**Alternatives considered:** Keep translation as optional (adds complexity for a redundant feature), build real-time voice translation (too complex for now).

## DEC-067: Edition-Aware Registration & Auto-Approval
**Date:** 2026-02-19
**What:** Community and enterprise editions now auto-approve accounts on email verification (`account_status = 'approved'`). SaaS keeps `pending_review` with admin approval gate. KYC fields (company name, website, use case) are only shown when `EDITION=saas`. Pending accounts endpoint returns empty array for non-SaaS editions.
**Why:** For self-hosted community edition, the user IS the admin — KYC and approval review are pointless friction. Removing this gate means register → verify → start using immediately.
**Alternatives considered:** Always show KYC (adds friction for self-hosters), always hide KYC (loses SaaS audit trail).

## DEC-068: API Token Display in Admin Dashboard
**Date:** 2026-02-19
**What:** Admin dashboard now shows the user's API token at the top with copy and regenerate buttons. `GET /admin/api/my-token` returns token from session, `POST /admin/api/regenerate-token` creates a new one and updates the session cookie.
**Why:** Previously tokens were only revealed once during registration. Regeneration required direct DB access. Making the token visible and regeneratable in the dashboard removes a major developer friction point.

## DEC-069: Smart Sandbox with LLM-Powered Replies
**Date:** 2026-02-19
**What:** After a sandbox send (any channel), the system can optionally generate a simulated reply using an LLM. A plug-and-play adapter auto-detects available LLM providers (Anthropic, OpenAI, custom OpenAI-compatible endpoint). Fire-and-forget with configurable delay. All mock providers now use realistic Twilio-format IDs (SM, CA, PN, EM, WA, LN prefixes).
**Why:** Developers testing in sandbox need to experience the full send-receive loop. Realistic IDs help catch format assumptions early. The LLM adapter uses raw fetch — zero new dependencies.
**Config:** `SANDBOX_LLM_ENABLED` (default true), `SANDBOX_LLM_ENDPOINT` (optional), `SANDBOX_REPLY_DELAY_MS` (default 2000ms).

## DEC-070: Orchestrator Integration Guide
**Date:** 2026-02-19
**What:** Created `docs/INTEGRATION.md` as the single integration reference. Available as: file on disk, rendered web page at `/docs/integration`, raw markdown at `GET /api/v1/integration-guide` (public, no auth). Consolidates info from ONBOARDING, SETUP, and CHANNEL-SETUP docs.
**Why:** Third-party developers (and their AI agents) need one comprehensive document to build a working integration. The raw markdown endpoint lets LLMs fetch and parse it programmatically.
**Note:** Originally called "master integration guide" — renamed to "orchestrator integration guide" for inclusive terminology.

## DEC-066: Session Cookies for Admin, Tokens for APIs
**Date:** 2026-02-19
**What:** Email/password login and registration now set an encrypted session cookie (`__bd_session`) that grants automatic access to the admin panel. Users no longer see a token reveal screen — they go straight to `/admin`. Org tokens still exist but are positioned for programmatic access (MCP agents, REST API), not for human login.
**Why:** The previous flow (register → reveal token → copy it → paste into admin login) was confusing for community edition where the sysadmin is the user (DEC-065). Session cookies provide standard browser-based auth. Tokens remain for API consumers.
**Implementation:** AES-256-CBC encrypted cookie with `{ orgId, userId, orgToken, expiresAt }`. HttpOnly, SameSite=Lax, 7-day expiry. Admin middleware checks cookie before Bearer token. Token-based login preserved as fallback for super-admins.
**Alternatives considered:** JWT (adds dependency, more complex), server-side sessions with session store (overkill for single-instance).

## DEC-065: Community Edition — Single User Role
**Date:** 2026-02-19
**What:** In the community (freeware) edition, the sysadmin and the account user are the same person using the same interface. No separate admin vs user roles. The person who deploys it is the person who uses it.
**Why:** Community edition is self-hosted by a single operator. Adding role separation adds complexity with no benefit — there's only one user. Role separation belongs in enterprise/SaaS editions where multiple users share an instance.
**Alternatives considered:** Shared role system across all editions (unnecessary overhead for community), separate admin UI (confusing when there's only one user).

## DEC-060: 3-Tier Distribution Model (Community, Enterprise, SaaS)
**Date:** 2026-02-18
**What:** Added `EDITION` env var (`community` | `enterprise` | `saas`). Tools like onboard-customer, billing, and org-management are gated behind enterprise/saas editions. Community edition is MIT-licensed, free, fully functional for core comms.
**Why:** Different customers need different packaging. Open-source community builds trust and adoption. Enterprise adds support + advanced tools. SaaS is hosted managed service.
**Alternatives considered:** Single edition with feature flags (too granular), paid-only (kills adoption).

## DEC-061: Country Compliance Rules Engine
**Date:** 2026-02-18
**What:** Created `country-compliance.ts` with per-country rules for 37 countries. Each rule specifies consent requirements, A2P registration, DNC checks, calling hours, recording consent, and applicable regulations. Integrated into provisioning to block provisioning in countries with unmet requirements (e.g. US without A2P registration).
**Why:** Global reach requires per-country guardrails. TCPA (US), GDPR (EU), CASL (Canada), PDPA (Singapore) etc. all have different requirements. Blocking at provisioning prevents legal exposure.
**Alternatives considered:** Per-region rules only (too coarse), no blocking (legal risk).

## DEC-062: Consent Tracking with Pre-Send Enforcement
**Date:** 2026-02-18
**What:** Added `contact_consent` table and three MCP tools (record/revoke/check consent). `preSendCheck()` in compliance.ts now blocks outbound messages when no active consent exists for the agent+contact+channel combination. STOP keyword in inbound SMS auto-revokes consent and adds to DNC.
**Why:** TCPA and GDPR require prior consent before outbound contact. Enforcement at the send layer (not just advisory) prevents accidental violations. STOP keyword auto-processing is legally required for SMS in the US.
**Alternatives considered:** Advisory-only consent (legal risk), consent per-org instead of per-agent (too broad).

## DEC-063: Sandbox-to-Production Organization Gating
**Date:** 2026-02-18
**What:** Added `mode` column to `organizations` table (`sandbox` | `production`). Sandbox orgs get mock providers (no real API calls). Production mode requires approval. Admin review endpoint flips mode on account approval.
**Why:** New integrators need a safe testing environment. Sandbox prevents accidental charges and real messages during development. Manual approval before production ensures KYC review.
**Alternatives considered:** No sandbox (risky for new users), automatic production after N days (no review).

## DEC-064: Data Retention Auto-Purge
**Date:** 2026-02-18
**What:** Created `data-retention.ts` with configurable per-table retention periods. Runs daily via setInterval (24h) + startup cleanup (30s delay). Defaults: messages 90d, usage_logs 365d, call_logs 365d, voicemail 30d, OTP 1d, revoked consent 730d. Disabled retention = no-op.
**Why:** GDPR requires data minimization. Storing data indefinitely is a liability. Per-table periods reflect different retention needs (OTP expires fast, consent records need long retention for audit).
**Alternatives considered:** Single global retention period (inflexible), external cron job (adds deployment complexity).

## DEC-059: Number Pool + Smart Routing
**Date:** 2026-02-17
**What:** Added a shared `number_pool` table and smart routing logic. Outbound SMS and voice calls now automatically select the best phone number from the pool based on the destination country. Same-country number = cheapest path. Falls back to the agent's own number if no pool match.
**Why:** Calling an Israeli number from a US number costs international rates. With an IL number in the pool, the system automatically routes via the local number. Agents don't need to know about number selection — it's transparent.
**How it works:** `detectCountryFromPhone()` maps E.164 prefixes to ISO country codes (~50 countries). `selectBestNumber()` picks: (1) same-country match, (2) default number, (3) any available number, (4) null. `resolveFromNumber()` tries pool first, then agent's own phone. Fully backward-compatible — empty pool = same behavior as before.
**Alternatives considered:** Per-agent number assignment only (no cost optimization), manual number selection per call (too much friction for the AI agent).

## DEC-050: TCPA Timezone Auto-Detection
**Date:** 2026-02-17
**What:** `comms_make_call` now accepts optional `recipientTimezone` and auto-detects timezone from phone prefix (e.g. +972→Asia/Jerusalem). Demo mode skips TCPA entirely.
**Why:** TCPA defaulted to America/New_York, blocking valid calls to international numbers during their local business hours. Auto-detection from E.164 prefix covers common cases; explicit param handles edge cases.
**Alternatives considered:** Always skip TCPA for international numbers (too permissive), require timezone on every call (too verbose).

## DEC-051: Protect .env from Test Suite
**Date:** 2026-02-17
**What:** Provisioning test now backs up `.env` before `comms_register_provider` and restores it in a `finally` block.
**Why:** The test was writing placeholder Twilio credentials (`ACtest123456789`) to `.env`, silently wiping real production credentials. This caused repeated credential loss across sessions.
**Alternatives considered:** Using a separate `.env.test` file (larger refactor), skipping the register_provider test (reduces coverage).

## DEC-052: CSP CDN Allowlist for Admin Pages
**Date:** 2026-02-17
**What:** Admin routes CSP now allows `cdn.jsdelivr.net` (Chart.js) and `unpkg.com` (Swagger UI) in script-src and style-src. Public pages keep the stricter policy.
**Why:** Charts and API docs were silently failing — blank cards with "No data yet" despite demo data being served correctly.
**Alternatives considered:** Self-hosting Chart.js (adds maintenance), removing charts (loses value).

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

## DEC-026: Orchestrator Token from .env
**Date:** 2026-02-15
**What:** An `ORCHESTRATOR_SECURITY_TOKEN` in `.env` serves as the admin credential. It can access any agent and perform admin-only operations.
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

## DEC-032: ~~SSE Endpoint Not Authenticated~~ → SUPERSEDED by DEC-074
**Date:** 2026-02-15
**What:** ~~The `GET /sse` endpoint (SSE connection) is not authenticated.~~ **Superseded:** SSE is now authenticated with the same 3-tier token validation as POST `/messages`. See DEC-074.
**Why:** Original reasoning was insufficient — SSE connections register agents and receive dispatched messages, which requires authentication.

## DEC-033: Orchestrator Token Required — Warn, Don't Crash
**Date:** 2026-02-15
**What:** If `ORCHESTRATOR_SECURITY_TOKEN` is not set and `DEMO_MODE=false`, the server logs a warning but still starts. Tool calls pass through without auth checks.
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
**What:** Rate limiting is skipped entirely in demo mode and for admin (orchestrator token) requests. Same pattern as auth guards.
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

## DEC-044: Identity & Isolation Modes — Config Only, Dedicated/Single-Account Implemented
**Date:** 2026-02-15
**What:** Added `identityMode` (dedicated/shared/hybrid) and `isolationMode` (single-account/per-agent-subaccount/per-customer-subaccount) to config. Only dedicated + single-account is implemented. Provisioning guards reject unsupported modes with clear error.
**Why:** The config schema anticipates future multi-tenancy needs without implementing them prematurely. Guards ensure no silent failure if someone sets an unsupported mode.
**Alternatives considered:** Implement all modes now (rejected — YAGNI, adds complexity without demand).

## DEC-045: Unified Onboarding Tool — comms_onboard_customer
**Date:** 2026-02-15
**What:** Single admin tool that wraps provisioning + email DNS + connection instructions into one call. Returns everything needed to connect: security token, channel info, DNS records, webhook URLs, SSE instructions.
**Why:** Reduces onboarding from multiple tool calls to one. Makes it easy for the connected AI agent system to provision new customers.
**Alternatives considered:** Keep provisioning as separate steps (rejected — too many round-trips for a standard flow).

## DEC-046: Zero-Dependency Security Middleware
**Date:** 2026-02-15
**What:** All HTTP security (headers, CORS, rate limiting, IP filtering) built with plain Express middleware. No helmet, cors, or rate-limit packages.
**Why:** Keeps dependencies minimal. The logic is simple enough that wrapping it in 30 lines of code is cleaner than adding a dependency. Also avoids version conflicts with Express 5.
**Alternatives considered:** helmet + cors + express-rate-limit packages (rejected — three new dependencies for simple middleware).

## DEC-047: In-Memory Rate Limiting & Nonce Cache
**Date:** 2026-02-15
**What:** HTTP rate limiter and replay nonce cache use in-memory Maps with periodic cleanup intervals. Not Redis or DB-backed.
**Why:** Single-instance server doesn't need distributed state. In-memory is fastest and simplest. Cleanup intervals prevent unbounded memory growth. If clustering is needed later, swap to Redis.
**Alternatives considered:** Redis (rejected — overkill for single instance), DB-backed (rejected — adds latency to every request).

## DEC-048: Brute-Force Lockout — 10 Failures, 15 Minutes
**Date:** 2026-02-15
**What:** After 10 failed auth attempts from an IP, lock it out for 15 minutes (429 response). Fires HIGH alert. Successful auth resets counter.
**Why:** Prevents credential stuffing while being lenient enough for legitimate users who mistype once or twice. 15 minutes is long enough to frustrate attackers but short enough to not permanently block legitimate users.
**Alternatives considered:** Exponential backoff (rejected — more complex, 15-min flat is simpler), CAPTCHA (rejected — MCP is API-only, no browser).

## DEC-049: Admin Route Auth — Bearer Token on POST Only
**Date:** 2026-02-15
**What:** Admin POST routes require `Authorization: Bearer <orchestratorToken>`. GET /admin/setup stays open. No token configured = allow (graceful degradation).
**Why:** Setup page must be accessible without auth (it's where you set the token). POST routes that modify config need protection. Graceful degradation matches existing patterns (DEC-033).
**Alternatives considered:** Auth on all routes including GET (rejected — blocks setup page access), session cookies (rejected — adds state management complexity).

## DEC-050: Multi-Tenant — org_id on Every Table
**Date:** 2026-02-16
**What:** Added `org_id TEXT DEFAULT 'default'` to all 15 data tables. Existing data migrates to 'default' org. All queries include org_id filter.
**Why:** Hard multi-tenant isolation requires every row to be org-scoped. Default org ensures backward compatibility. No cross-org joins allowed.
**Alternatives considered:** Separate databases per org (too heavy for SQLite), tenant ID only on agent_channels with JOINs (leaky — requires JOIN discipline everywhere).

## DEC-051: 3-Tier Authentication — Super-Admin, Org-Admin, Agent
**Date:** 2026-02-16
**What:** Three auth tiers: orchestrator token → super-admin (sees all), org token → org-admin (sees own org), agent token → agent (sees own data). Middleware checks in this order.
**Why:** Platform operators need full access. Org admins manage their org. Agents are scoped to themselves. Clean separation of concerns.
**Alternatives considered:** Role field on tokens (more complex), JWT with claims (adds dependency, DEC-025 already chose bearer tokens).

## DEC-052: Org Token Storage — SHA-256 Hash, Same Pattern as Agent Tokens
**Date:** 2026-02-16
**What:** Org tokens use the same SHA-256 hashing pattern as agent tokens (DEC-025). Stored in `org_tokens` table. Raw token shown once at creation.
**Why:** Proven pattern, consistent code, no new dependencies.

## DEC-053: Admin API Org Scoping — orgFilter Helper
**Date:** 2026-02-16
**What:** Reusable `orgFilter()` and `orgWhere()` helpers in org-scope.ts generate SQL clauses based on auth tier. Super-admin gets empty clause (sees all), org-admin gets `AND org_id = ?`.
**Why:** Prevents forgetting org_id in queries. Single source of truth for org filtering logic. Consistent across all endpoints.

## DEC-054: Login CSS Bug — Attribute Selector Fix
**Date:** 2026-02-16
**What:** Changed `.login-box button` to `.login-box button[type="submit"]` to prevent submit button styling from applying to the password eye toggle.
**Why:** CSS specificity issue — the broad selector matched all buttons in the login box. Attribute selector targets only the submit button.

## DEC-055: Per-Agent Language — Column on agent_channels
**Date:** 2026-02-16
**What:** Added `language TEXT DEFAULT 'en-US'` column to `agent_channels`. Each agent has its own operating language. Inbound voice uses agent's language for Twilio STT instead of global default.
**Why:** Different agents may serve different markets/languages. Global default is insufficient when agents coexist in multiple languages. The agent's language determines what they "hear" and "read".

## DEC-056: Translation Engine — Anthropic API via Claude Haiku
**Date:** 2026-02-16
**What:** Translation uses the existing `ANTHROPIC_API_KEY` with Claude Haiku (cheapest/fastest model). No new API keys or paid dependencies. Feature gated behind `TRANSLATION_ENABLED=true` (default: false).
**Why:** Anthropic API is already optionally configured for the answering machine. Haiku is ~$0.001 per translation — trivial cost. Keeping it off by default means zero cost until explicitly enabled.
**Alternatives considered:** Google Translate API (requires new key), DeepL (new dependency), local models (too slow for real-time voice).

## DEC-057: Translation Architecture — Stateless, No Cache
**Date:** 2026-02-16
**What:** Each translation is an independent API call. No translation memory, no caching, no batching.
**Why:** Simplicity. Voice calls need real-time translation (<1s latency). Caching adds complexity with marginal benefit — most messages are unique. Haiku response time is fast enough for voice.

## DEC-058: Original Message Preservation — body_original Column
**Date:** 2026-02-16
**What:** Added `body_original TEXT` and `source_language TEXT` columns to the `messages` table. When a message is translated, the original is stored in `body_original` and the translated version in `body`.
**Why:** Audit trail. The agent sees the translated message, but the original is preserved for debugging, compliance, and potential re-translation. `source_language` enables language analytics.
