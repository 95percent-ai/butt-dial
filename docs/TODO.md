<!-- version: 5.1 | updated: 2026-02-21 -->

# TODO — AgentOS Communication MCP Server

Philosophy: Infrastructure first. Verify it runs. Small wins that prove the core loop. Expand to MVP. Then layer features. Never go deep before proving the foundation works.

---

## Phase 0 — Third-Party Setup & Credentials
Only set up what's needed for the next few phases. Add providers when their phase arrives.

### Now (needed for Phases 1-5)
- [ ] Twilio — verify Account SID + Auth Token work (already have account)
- [ ] Twilio — create Restricted API Key via API (script will automate)
- [ ] Twilio — buy one test phone number via API (script will automate)
- [ ] ElevenLabs — verify API key works (already have account)
- [ ] SQLite — no setup needed (local file, zero signup)
- [ ] Edge TTS — no setup needed (free, no API key)
- [ ] Copy .env.example → .env, fill in Twilio + ElevenLabs credentials
- [ ] **Verify:** Twilio API responds, ElevenLabs API responds

### Later (set up when phase arrives)
- [ ] Phase 6 (email): Sign up for Resend, verify domain
- [ ] Phase 7 (WhatsApp): Sign up for GreenAPI (dev). Start Meta Business Verification for Twilio WhatsApp (production, 5-20 days)
- [ ] Production DB: Sign up for Neon (or other Postgres provider)
- [ ] A2P 10DLC: Submit campaign registration for US SMS (1-2 week approval)

### Automatable via API (for customer onboarding)
- [ ] Document which steps can be automated per customer:
  - Twilio subaccount creation (Accounts API) — instant
  - Phone number purchase + webhook config (API) — instant
  - WhatsApp sender registration (Senders API) — minutes-hours
  - GreenAPI instance creation (API) — instant
  - Resend domain creation (API generates DNS records, customer adds them)
  - A2P 10DLC campaign submission (API, 1-2 week approval)
- [ ] Build setup script (scripts/setup.ts) that automates API key creation, number purchase, DB migration

---

## Phase 1 — Infrastructure & Verification
Get a running server with zero business logic. Prove everything connects.

- [x] Project scaffolding (package.json, tsconfig.json, .env.example, folder structure)
- [x] Install dependencies (@modelcontextprotocol/sdk, express, typescript, etc.)
- [x] MCP server skeleton (index.ts, server.ts) — starts and registers one dummy tool
- [x] Express HTTP server — starts alongside MCP, responds to GET /health
- [x] Database connection via provider interface (SQLite for local dev)
- [x] Run schema migration (core tables only: agent_channels, messages, agent_pool)
- [x] Provider interfaces (ITelephonyProvider, IEmailProvider, IWhatsAppProvider, ITTSProvider, ISTTProvider, IVoiceOrchestrator, IDBProvider, IStorageProvider)
- [x] Provider factory skeleton (config → adapter, returns stub for now)
- [x] Config loader (.env → typed config object with validation)
- [x] **Verify:** Server starts, /health returns 200, DB connects, MCP client can list the dummy tool

## Phase 2 — First Small Win: Send an SMS
Prove the core loop: agent → send message → human receives it.

- [x] Twilio telephony adapter — just `sendSms()` method
- [x] Mock telephony adapter (for demo mode / dev testing)
- [x] `comms_send_message` tool (SMS only, minimal fields)
- [x] Basic agent_channels table seeding (manually insert one test agent)
- [x] **Verify (dry):** Mock adapter — 21/21 tests pass (tool listing, send, DB record, error handling)
- [x] **Verify (live):** `comms_send_message` → real Twilio SMS sent (SM7cba9d63830ce9e2188805e6e5e45687)

## Phase 3 — Small Win: Receive an SMS
Close the loop. Inbound message routes back to the agent.

- [x] Inbound SMS webhook (POST /webhooks/:agentId/sms)
- [x] Webhook router (Express)
- [x] Store inbound message metadata in messages table
- [x] Forward inbound to agent callback URL (AGENTOS_CALLBACK_URL)
- [x] `comms_get_messages` tool (basic — list messages for an agent)
- [x] Twilio `configureWebhooks` method (look up phone SID, update SMS URL)
- [x] **Verify (dry):** Simulated webhook — 20/20 tests pass (store, retrieve, errors)
- [x] **Verify (live):** Real SMS received via Twilio webhook → ngrok → stored in DB (SM4f23ba2cfed794fd50be75ada8da7386)

## Phase 4 — Small Win: Make a Phone Call
Agent calls a human, plays a pre-recorded voice message.

- [x] Twilio adapter — `makeCall()` method
- [x] Mock adapter — `makeCall()` method
- [x] ElevenLabs TTS adapter — `synthesize()` method (generate audio)
- [x] Mock TTS adapter — returns silent WAV for dev/demo
- [x] Local storage adapter — saves audio to disk, serves via /storage route
- [x] `comms_send_voice_message` MCP tool (TTS → storage → call → DB log)
- [x] **Verify (dry):** Mock TTS + mock call — 26/26 assertions pass
- [x] Edge TTS adapter — free, no API key (built alongside ElevenLabs adapter)
- [x] **Verify (live):** Edge TTS → real audio (45KB MP3) → stored locally → publicly accessible via ngrok → Twilio API called correctly. Outbound call blocked by Twilio trial restriction only (not a code issue). Full pipeline verified virtually.

## Phase 5 — Small Win: Live Voice AI Conversation
The big one. Human calls agent's number, talks to an LLM in real-time.

- [x] Inbound call webhook → returns ConversationRelay TwiML
- [x] Voice WebSocket handler (voice-ws.ts) — receives text prompts, sends text responses
- [x] LLM integration in WebSocket handler (stream response tokens back)
- [x] Interruption handling
- [x] `comms_make_call` tool (outbound AI voice call)
- [x] **Verify (dry):** 25/25 assertions pass — make call, DB record, WebSocket setup/prompt/response, error cases
- [x] **Refactor: voice-ws.ts — remove direct Anthropic LLM call.** Voice transcripts route back to the connected MCP client (the third-party AI agent), not to Claude. The agent provides responses because it has the context. (DEC-042)
- [x] **Fallback answering machine:** When the AI agent is not connected or not responding, use a built-in LLM (Claude) as a smart voicemail. It apologizes, collects the caller's message and preferences, then stores everything with full context (who called, when, what channel, what was said). When the agent reconnects, dispatch all collected messages so it can decide what to do. (DEC-042)
- [x] Remove `anthropic` as a registered provider in `comms_register_provider`. Anthropic key is only needed for the fallback answering machine (optional, not a "provider").
- [ ] **Verify (live):** Call the agent's number → have a live conversation with the AI *(blocked: Twilio trial account restrictions — inbound/outbound calls require verified numbers. Resume after upgrading to full Twilio account)*

## Phase 6 — Expand: Email Channel
Add email send/receive using Resend as the provider.

- [x] Resend email adapter — `send()` + `verifyDomain()` methods
- [x] Mock email adapter — for demo/dev mode
- [x] Extend `comms_send_message` to support email channel (channel, subject, html params)
- [x] Inbound email webhook (Resend webhook → POST /webhooks/:agentId/email)
- [x] Config: `resendApiKey` added, factory wires email provider
- [x] **Verify (dry):** 38/38 assertions pass — send email, DB record, inbound webhook, get_messages filter, error cases, SMS regression

## Phase 7 — Expand: WhatsApp Channel
Add WhatsApp send/receive using Twilio WhatsApp API.

- [x] WhatsApp send via Twilio adapter (whatsapp-twilio.ts)
- [x] Mock WhatsApp adapter for demo mode (whatsapp-mock.ts)
- [x] Extend `comms_send_message` to support WhatsApp channel (+ templateId, templateVars)
- [x] Inbound WhatsApp webhook (POST /webhooks/:agentId/whatsapp)
- [x] whatsapp_pool table in schema
- [x] Seed script updated with whatsapp_sender_sid
- [x] Template support (ContentSid + ContentVariables params)
- [x] Factory wiring for WhatsApp provider
- [x] **Verify (dry):** 37/37 assertions pass — send WhatsApp, template params, inbound webhook, DB records, error cases, SMS + email regression
- [ ] **Verify (live):** Real Twilio WhatsApp send/receive *(future — requires WhatsApp sandbox or verified sender)*

## MCP Onboarding — Required Fields
Define and validate the required fields for setting up a new MCP server instance.

- [x] Document required fields per channel (docs/ONBOARDING.md — channel requirements table)
- [x] Add validation/startup check — server warns about missing fields on boot (logStartupWarnings in config.ts)
- [x] Update setup UI (`/admin/setup`) to collect all required fields per channel (5 cards: Twilio, ElevenLabs, Resend, Server Settings, Voice Defaults)
- [x] Seed script or onboarding flow that provisions a test agent with all fields populated (email, system_prompt, greeting, spending_limits)
- [x] Document how to connect to this MCP server and associate an AI agent with its communication services (docs/ONBOARDING.md — SSE, tools, channel requirements, voice architecture)

---

## Phase 8 — MVP: Provisioning & Teardown
Automate what we've been doing manually. Full agent lifecycle + customer onboarding via API.

- [x] `comms_provision_channels` tool (buy number, configure webhooks, assign WhatsApp from pool, set up email)
- [x] `comms_deprovision_channels` tool (release number, return pool slot, clean up)
- [x] `comms_get_channel_status` tool
- [x] Agent pool management (configurable pool size, default 5)
- [x] Configuration architecture: identity mode (dedicated/shared/hybrid), isolation mode (single account/per-agent subaccount/per-customer subaccount) — config fields added, only dedicated/single-account implemented, provisioning guards unsupported modes
- [x] Automated customer onboarding: `comms_onboard_customer` tool — provisions all channels, generates email DNS records, returns complete setup package (security token, channels, DNS, webhook URLs, SSE instructions)
- [x] `comms_register_provider` tool (register/verify third-party credentials)
- [x] **Verify (dry):** 60/60 assertions pass — provision agent with all channels, deprovision, pool capacity, register provider, SMS + email + WhatsApp regression
- [ ] **Verify (live):** Real Twilio number purchase + release *(future — requires full Twilio account)*

## Phase 9 — MVP: Security & Auth
Lock it down. Every tool call authenticated.

- [x] Agent registration + security token issuance (token-manager.ts)
- [x] Auth middleware (validate token on every MCP tool call)
- [x] Impersonation guard (token bound to agentId)
- [x] Webhook signature validation (Twilio X-Twilio-Signature, Resend/Svix)
- [x] Input sanitizer (SQL injection, XSS, header injection, path traversal, command injection)
- [x] Provider credentials encrypted at rest (AES-256-GCM)
- [x] agent_tokens table + spending_limits table + provider_credentials table
- [x] Auth guards on all tool files (requireAgent for agent tools, requireAdmin for admin tools)
- [x] Provisioning returns securityToken, deprovision revokes it
- [x] **Verify (dry):** 49/49 assertions pass — token manager, sanitizer, crypto, Twilio signature, provisioning token flow, sanitizer integration, SMS + email + WhatsApp regression

## Phase 10 — MVP: Rate Limiting & Cost Tracking
Prevent abuse and track spend.

- [x] Rate limiter (per-minute, per-hour, per-day action counts)
- [x] Spending caps (per-day, per-month) — enforced, not advisory
- [x] Anti-harassment frequency tracking (max calls/day to same number)
- [x] Cost tracker (per-action cost recording in usage_logs)
- [x] `comms_get_usage_dashboard` tool
- [x] `comms_set_agent_limits` tool
- [x] usage_logs table + indexes (rate_limits/contact_frequency derived from usage_logs — see DEC-034/036)
- [x] Provisioning creates default spending_limits row, deprovision deletes it
- [x] **Verify (dry):** 27/27 assertions pass — getAgentLimits defaults, logUsage, checkRateLimits pass/fail for each limit type, demo mode skip, admin skip, error formatting

## Phase 11 — Feature: Observability & Admin Alerts
Full visibility without reading private messages.

- [x] Health check endpoints (/health liveness, /health/ready provider check)
- [x] Prometheus metrics endpoint (/metrics)
- [x] Structured JSON logger (no PII)
- [x] Audit log with SHA-256 hash chain (audit_log table)
- [x] Alert manager (severity routing: CRITICAL/HIGH/MEDIUM/LOW)
- [x] WhatsApp alerter to admin (ADMIN_WHATSAPP_NUMBER)
- [x] **Verify (dry):** 26/26 assertions pass — metrics increment/gauge/Prometheus format, audit log hash chain insert/verify/corrupt detection, alert routing by severity, WhatsApp alerter returns false when not configured

## Phase 12 — Feature: Attack Hardening
Layer on protection now that the core works.

- [x] DDoS protection middleware (global + per-IP HTTP rate limits, 1MB payload caps, trust proxy)
- [x] IP allowlist/denylist for admin + webhook endpoints
- [x] Replay attack prevention (Twilio nonce cache with 5-min TTL, Resend timestamp validation)
- [x] CORS middleware (configurable allowed origins, OPTIONS preflight 204) + security headers (CSP, X-Frame, nosniff, XSS-Protection, HSTS, Referrer-Policy)
- [x] Anomaly detector (volume spikes, brute force detection, rapid token rotation)
- [x] Brute-force lockout on auth endpoints (10 failures → 15-min lockout, HIGH alert)
- [x] Admin route auth (Bearer token on POST routes, GET /admin/setup stays open)
- [ ] **Verify:** Replay an old webhook → rejected. Flood requests → throttled. Anomaly triggers alert.

## Phase 13 — Feature: Advanced Voice
Expand voice capabilities.

- [x] `comms_transfer_call` tool (transfer live call to human)
- [x] Call logging (call_logs table, duration, cost, recording URL)
- [x] STT adapter — Deepgram (default) + mock for demo
- [x] Alternative TTS adapter (OpenAI TTS)
- [x] Audio format conversion (PCM ↔ mu-law 8kHz, WAV headers)
- [x] Call status callback route
- [x] **Verify (dry):** 26/26 assertions pass

## Phase 14 — Feature: Provider Adapters
Prove the pluggable architecture with real alternatives.

- [x] Extended `comms_register_provider` to 10 providers
- [x] Vonage telephony adapter (SMS, calls, transfers, number management)
- [x] S3 storage adapter (AWS Signature V4)
- [x] R2 storage adapter (Cloudflare, wraps S3)
- [x] Turso/libSQL database adapter
- [x] Convex database adapter
- [x] OpenAI TTS adapter
- [x] Deepgram STT adapter
- [x] **Verify (dry):** 42/42 assertions pass

## Phase 15 — Feature: Swagger + API Explorer
Make it testable and explorable without an MCP client.

- [x] OpenAPI 3.1 spec generation (all REST paths, security schemes, MCP tools)
- [x] Swagger UI at /admin/api-docs (CDN-based, dark theme)
- [x] Demo mode banner in Swagger UI
- [x] Scenario test runner (8 end-to-end scenarios in demo mode)
- [x] **Verify (dry):** 29/29 assertions pass

## Phase 16 — Feature: Setup UI + Admin Dashboard
Web-based setup and monitoring.

- [x] Admin dashboard at /admin/dashboard (agent status, costs, alerts, auto-refresh)
- [x] Dashboard data API at /admin/api/dashboard
- [x] Setup wizard already existed at /admin/setup (5 cards: Twilio, ElevenLabs, Resend, Server, Voice)
- [x] **Verify (dry):** 17/17 assertions pass

## Phase 17 — Feature: Compliance
Regulatory requirements.

- [x] Content filtering on outbound messages (profanity, abuse, threats)
- [x] DNC list checking before outbound calls and messages
- [x] TCPA time-of-day enforcement (no calls before 8am / after 9pm local)
- [x] Recording consent announcements (two-party consent jurisdictions)
- [x] CAN-SPAM: unsubscribe check in outbound emails (warning only)
- [x] GDPR right-to-erasure (deletes data from all tables by identifier)
- [x] Compliance wired into send-message and make-call tools
- [x] **Verify (dry):** 27/27 assertions pass

## Phase 18 — Feature: Billing & Markup
Revenue layer.

- [x] Configurable markup percentage (global + per-agent override)
- [x] Tier system (free/starter/pro/enterprise with preset limits)
- [x] `comms_get_billing_summary` tool (provider cost vs billed cost breakdown)
- [x] `comms_set_billing_config` tool (set tier, markup, billing email)
- [x] Spending alerts at 80% of daily/monthly cap
- [x] **Verify (dry):** 36/36 assertions pass

## Phase 19 — Documentation
Ship with comprehensive docs.

- [x] README.md (quick start, tool listing, tech stack)
- [x] SETUP.md (full setup guide)
- [x] API.md (REST API reference)
- [x] MCP-TOOLS.md (tool reference with examples)
- [x] PROVIDERS.md (provider adapter guide)
- [x] SECURITY.md (threat model, hardening)
- [x] OBSERVABILITY.md (monitoring guide)
- [x] TROUBLESHOOTING.md (common issues)
- [x] ARCHITECTURE.md (diagrams, data flow)
- [x] **Verify:** 52/52 assertions pass

## Phase 20 — Polish
Final refinements.

- [x] Conversation threading (contactAddress filter in comms_get_messages)
- [x] `comms_expand_agent_pool` tool (resize agent pool)
- [x] Expanded demo scenarios (8 total: health, readiness, metrics, swagger, spec, dashboard data, security headers, dashboard page)
- [x] Comprehensive end-to-end test suite (49 assertions covering all tools, endpoints, compliance, billing, admin)
- [x] **Verify (dry):** 49/49 end-to-end assertions pass

## Phase 21 — Multi-Tenant Organization Isolation
Hard security boundaries between organizations. No data leaks across tenants.

- [x] **Organization model** — `organizations` + `org_tokens` tables, org-manager.ts CRUD + token management
- [x] **Org → Agent association** — every table gets `org_id` column (15 tables), all existing data migrated to 'default' org
- [x] **Tenant-scoped auth** — 3-tier auth: super-admin (orchestrator token) → org-admin (org token) → agent (agent token)
- [x] **Data isolation** — all queries scoped by org_id via org-scope.ts helpers (orgFilter, orgWhere, requireAgentInOrg)
- [x] **Impersonation guard** — org boundary enforced at middleware + tool level. Agent tokens include orgId
- [x] **Credential isolation** — provider_credentials table has org_id column, queries scoped
- [x] **Rate limiting per org** — usage_logs scoped by org_id
- [x] **Admin scoping** — admin dashboard + API queries filter by org_id. Super-admin sees all orgs
- [x] **MCP tools** — `comms_create_organization` + `comms_list_organizations` (super-admin only)
- [x] **Tool scoping** — all 16 tool files + 5 webhook files + 4 lib files updated with org_id
- [x] **Login bug fix** — CSS specificity fix for eye toggle button overlap
- [x] **Tests** — 50/50 multi-tenant assertions pass (schema, org CRUD, data isolation, admin API, tokens, duplicate protection)

## Phase 22 — Feature: Dynamic Language + Real-Time Translation
Per-agent language with automatic translation across all channels.

- [x] **Translator module** — `src/lib/translator.ts` with `detectLanguage()`, `translate()`, `needsTranslation()`, `getAgentLanguage()` using Anthropic API (Claude Haiku)
- [x] **Config** — `TRANSLATION_ENABLED` boolean (default: false), reuses existing `ANTHROPIC_API_KEY`
- [x] **DB migration** — `language` column on `agent_channels`, `body_original` + `source_language` on `messages`
- [x] **Voice sessions** — `callerLanguage` + `agentLanguage` on `VoiceCallConfig` and `VoiceConversation`
- [x] **Voice translation bridge** — inbound transcription translated to agent's language, outbound response translated to caller's language
- [x] **Inbound SMS translation** — auto-detect sender language, translate to agent's language, store original in `body_original`
- [x] **Inbound WhatsApp translation** — same pattern as SMS
- [x] **Inbound voice** — uses agent's language instead of global default for TwiML
- [x] **`comms_make_call` tool** — added `targetLanguage` param (language of person being called)
- [x] **`comms_send_message` tool** — added `targetLanguage` param (translates outbound before sending)
- [x] **Admin UI** — language dropdown in agent edit panel, translation toggle card in settings
- [x] **Admin API** — `POST /admin/api/agents/:agentId/language`, `TRANSLATION_ENABLED` in save list, translation in dashboard services
- [x] **Tests** — 33/33 translation assertions pass, 49/49 end-to-end regression pass

## Phase 23 — Feature: Number Pool + Smart Routing
Shared phone number pool with automatic country-based outbound routing. Same-country = cheapest path.

- [x] **Schema** — `number_pool` table (phone_number, country_code, capabilities, is_default, org_id) + index
- [x] **Migration** — `schema-number-pool.sql` loaded in `migrate.ts`
- [x] **Core module** — `src/lib/number-pool.ts`: `detectCountryFromPhone()` (~50 countries), `selectBestNumber()` (same-country → default → any → null), `resolveFromNumber()` (pool → agent fallback)
- [x] **Seed data** — US +18452514056 (default), IL +97243760273
- [x] **Integration: send-message** — SMS routing uses `resolveFromNumber()` from pool
- [x] **Integration: make-call** — voice call routing uses `resolveFromNumber()` from pool
- [x] **Integration: send-voice-message** — voice message routing uses `resolveFromNumber()` from pool
- [x] **Tests** — 21/21 assertions pass (12 unit + 2 DB + 4 integration + 2 regression + 1 channel filter)
- [x] **Backward compatible** — empty pool = same behavior as before (agent's own number)

## Phase 24 — Third-Party MCP Onboarding
Complete onboarding experience: register → sandbox → provision agents → test → get approved → go production.

- [x] **24.1** Registration form KYC fields (Company Name, Website, Use Case, ToS checkbox) + privacy explanation
- [x] **24.2** Org Status API (`GET /admin/api/my-org`) — returns role, mode, status, agent count, pool info
- [x] **24.3** Sandbox/production banner in admin dashboard (yellow=pending, blue=approved, red=suspended)
- [x] **24.4** Agent provisioning UI — New Agent button, provision form, token reveal modal, deprovision button, pool capacity
- [x] **24.5** Post-registration "What's Next" guide (7-step numbered walkthrough)
- [x] **24.6** Channel setup documentation (`docs/CHANNEL-SETUP.md`) — SMS, Voice, Email, WhatsApp, LINE with inbound/outbound/two-way
- [x] **24.7** Integration guide page (`/docs/integration`) + channel setup page (`/docs/channel-setup`) on docs site
- [x] **24.8** Tests — 44/44 assertions pass (KYC fields, ToS, my-org API, admin banner, provisioning UI, integration guide, channel setup, regression)

## Phase 25 — Regulatory Compliance & Distribution Model
Global compliance guardrails, distribution tiers, consent tracking, and data retention.

### Distribution & Business Model
- [x] **A1.** `LICENSE` file (MIT) for community edition
- [x] **A2.** `ENTERPRISE.md` explaining community vs enterprise vs SaaS tiers
- [x] **A3.** `EDITION` env var in `config.ts` (`community` | `enterprise` | `saas`)
- [x] **A4.** Edition gating — enterprise/saas-only tools conditionally registered

### Global Legal Framework
- [x] **B1.** `/legal/terms` page (Terms of Service HTML)
- [x] **B2.** `/legal/aup` page (Acceptable Use Policy HTML)
- [x] **B3.** `/legal/privacy` page (Privacy Policy HTML)
- [x] **B4.** Legal page routes added to Express
- [x] **B5.** Footer links added to landing page
- [x] **B6.** `country-compliance.ts` — per-country rules engine (US, CA, GB, DE, FR, IL, AU, JP, BR, IN, SG, AE + 27 EU states)
- [x] **B7.** `tos_accepted_at` column on `user_accounts`, required at registration
- [x] **B8.** `country_terms_accepted` table for per-country terms tracking
- [x] **B9.** Country compliance rules integrated into provisioning

### Consent & Liability Protection
- [x] **C1.** `contact_consent` table (schema-consent.sql)
- [x] **C2.** `comms_record_consent`, `comms_revoke_consent`, `comms_check_consent` MCP tools
- [x] **C3.** Consent check integrated into `preSendCheck()` in compliance.ts
- [x] **C4.** STOP keyword auto-processing in inbound SMS → revoke consent + add to DNC
- [x] **C5.** `mode` column on `organizations` (sandbox | production)
- [x] **C6.** Provider factory returns mock providers for sandbox orgs
- [x] **C7.** KYC fields on registration (company_name, website, use_case_description)
- [x] **C8.** `account_status` field (pending_review → approved → suspended)
- [x] **C9.** Admin endpoints for pending account review (list + approve/reject)

### Twilio/Provider Config
- [x] **D4.** `TWILIO_MESSAGING_SERVICE_SID` config, sends SMS via Messaging Service when set

### Data Retention
- [x] **E1.** `data-retention.ts` — configurable auto-purge per table
- [x] **E2.** Retention config vars added to `.env.example`
- [x] **E3.** Daily cleanup job scheduled in `index.ts`

### Tests & Verification
- [x] **F1-F7.** 84/84 assertions pass (legal pages, country rules, consent tracking, sandbox gating, edition gating, data retention, regression)

## Phase 26 — Simplify Third-Party Integration
Dead-simple developer onboarding: register → get token → test in sandbox → go live.

### A. Edition-Aware Registration
- [x] **A1.** Community/enterprise auto-approves accounts on email verification (no KYC gate)
- [x] **A2.** KYC fields (company, website, use case) hidden for non-SaaS editions
- [x] **A3.** Pending accounts endpoint returns empty for non-SaaS editions

### B. API Token in Admin Panel
- [x] **B1.** `GET /admin/api/my-token` — returns org token from session cookie
- [x] **B2.** `POST /admin/api/regenerate-token` — generates new token, updates session
- [x] **B3.** API Key card in admin dashboard (copy + regenerate buttons)

### C. Smart Sandbox
- [x] **C1.** `src/lib/llm-adapter.ts` — plug-and-play LLM interface (Anthropic, OpenAI, custom endpoint)
- [x] **C2.** `src/lib/sandbox-responder.ts` — fire-and-forget simulated replies after sends
- [x] **C3.** All mock providers use realistic Twilio-format IDs (SM, CA, PN, EM, WA, LN)
- [x] **C4.** Config vars: `SANDBOX_LLM_ENABLED`, `SANDBOX_LLM_ENDPOINT`, `SANDBOX_REPLY_DELAY_MS`
- [x] **C5.** Sandbox reply hook in send-message (MCP + REST) for all 4 channels

### D. Integration Document
- [x] **D1.** `docs/INTEGRATION.md` — orchestrator integration guide
- [x] **D2.** Updated `/docs/integration` web page
- [x] **D3.** `GET /api/v1/integration-guide` — returns raw markdown (public, no auth)

### Tests
- [x] **40/40** assertions pass (`tests/third-party-integration.test.ts`)

---

## Phase 27 — Message Queue + Remove Translation (DEC-072, DEC-073)

### A. Dead Letter Queue (expand voicemail_messages → all channels)
- [x] **A1.** Rename/expand `voicemail_messages` → `dead_letters` table: covers all channels, only stores on failure
- [x] **A2.** Schema: `id`, `agent_id`, `org_id`, `channel`, `reason` (agent_offline/send_failed/provider_error), `direction`, `from_address`, `to_address`, `body`, `media_url`, `original_request`, `error_details`, `status` (pending/acknowledged), `created_at`, `acknowledged_at`
- [x] **A3.** `comms_get_waiting_messages` tool — returns unacknowledged dead letters for the agent (fetch = acknowledge)
- [x] **A4.** Acknowledge on fetch — agent fetches pending messages, status auto-set to acknowledged
- [x] **A5.** Auto-purge: acknowledged dead letters deleted after configurable TTL (default 7 days)
- [x] **A6.** Outbound send failures → write to `dead_letters` with original request (so agent can retry)
- [x] **A7.** Inbound messages when agent is offline → write to `dead_letters` (deliver on reconnect)
- [x] **A8.** Successful sends and successful inbound deliveries → nothing stored
- [x] **A9.** Remove `messages` table as conversation store (usage stats stay in `usage_logs`)
- [x] **A10.** Migrate existing `voicemail_messages` dispatch-on-reconnect logic to use `dead_letters`
- [x] **A11.** Update INTEGRATION.md — explain dead letter model, instruct integrators that conversation memory is the agent's responsibility
- [x] **A12.** Update admin dashboard — usage stats from `usage_logs`, not `messages`

### B. Remove Server-Side Translation
- [x] **B1.** Remove `targetLanguage` param from `comms_send_message` and `comms_make_call`
- [x] **B2.** Remove `translate()`, `needsTranslation()`, `getAgentLanguage()` calls from tool handlers
- [x] **B3.** Remove `body_original`, `source_language` columns (or keep for queue metadata)
- [x] **B4.** Keep `src/lib/translator.ts` module available for future human-to-human bridging
- [x] **B5.** Remove translation UI from admin settings panel
- [x] **B6.** Update INTEGRATION.md and capability cards — remove translation references

### C. Future: Conversation Persistence Module (Paid)
- [ ] **C1.** Design per-agent-target persistence as an optional paid module
- [ ] **C2.** Separate storage from the queue (persistent store vs temp queue)
- [ ] **C3.** API for querying conversation history (only if module enabled)

### D. Future: Human-to-Human Translation
- [ ] **D1.** Evaluate text translation for bridged SMS conversations
- [ ] **D2.** Research real-time voice interpretation for bridged calls (product-level effort)

### Tests
- [x] Update existing tests to reflect queue model (12 test files, 335+ assertions pass)
- [x] Remove translation-related test assertions (translation test rewritten for removal verification)

---

## Open Items

- [x] ~~Discuss the "You're All Set" screen after registration~~ — Resolved by DEC-066: token reveal screen removed, session cookies auto-redirect to `/admin` after login/registration. Tokens remain for API/MCP access only.

---

## SaaS Version — Future

- [ ] Add provider disclaimer to Privacy Policy — "We pass data to providers you configure (Twilio, Resend, etc.) and don't control how they handle it"
- [ ] Add arbitration clause to Terms — mandatory binding arbitration, no class actions
- [ ] Link to provider terms — section listing Twilio ToS, Resend ToS, Vonage ToS, etc.
- [ ] 3-step onboarding visual on landing page — Connect → Configure → Communicate
- [ ] Trust/stats section on landing page — agents connected, messages sent, countries supported
