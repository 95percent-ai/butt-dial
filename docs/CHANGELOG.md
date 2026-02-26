<!-- version: 4.5 | updated: 2026-02-26 -->

# Changelog

## Session 30 — 2026-02-26

### Token-as-API-Key (DEC-082)
- **Provisioning:** `agentId` is now auto-generated as a UUID. Users no longer need to choose an agent ID — the token is the sole credential they manage.
- **SSE connection:** `GET /sse?token=<token>` — agentId is auto-resolved from agent tokens. Org/orchestrator tokens can still pass `?agentId=X`.
- **MCP tools:** `agentId` made optional in `comms_provision_channels`, `comms_onboard_customer`, `comms_deprovision_channels`, `comms_set_agent_limits`, `comms_set_billing_config`. All auto-detect from token.
- **REST API:** Same pattern — provision, deprovision, onboard, billing/config, agent-limits endpoints accept optional agentId.
- **Admin UI:** Removed "Agent ID" input from provision form. Token reveal modal relabeled to "API Key". Agents table no longer shows Agent ID column.
- **OpenAPI spec:** All schemas updated — agentId marked optional with "auto-detected from token" descriptions.
- **Docs:** SSE examples in docs pages and INTEGRATION.md use token-only URLs. Curl examples omit agentId from request bodies.

### Demo/Live Toggle + Org Spending Limits (DEC-083, DEC-084)
- **Operation Mode card** in Settings tab — demo/live toggle with confirmation modal for switching to live mode
- **Org spending limits** — `max_spend_per_day` and `max_spend_per_month` on organizations table, enforced before per-agent caps
- **Health endpoint** now includes `mode` field ("demo" or "live") in response

### Documentation Alignment
- Updated SPEC.md (v2.3): token-only auth model, org spending caps, demo/live toggle, mode in health
- Updated TODO.md (v5.3): Phase 28 (demo/live + org spending) and Phase 29 (token-as-API-key) entries
- Updated DECISIONS.md (v4.8): DEC-082, DEC-083, DEC-084
- Updated STRUCTURE.md (v4.0): org columns, agent_id auto-generated note
- Updated INTEGRATION.md (v1.4): token-only SSE, no agentId in curl examples, mode in health
- Updated test-report-response.md: live mode toggle info

## Session 29 — 2026-02-24

### QA Fixes — Logout, Agent Form, Channel IDs

#### Fix 1: Logout Cache Prevention
- Added `Cache-Control: no-store` header to the admin page response (`GET /admin`)
- Browser back button after logout now redirects to login instead of showing cached page

#### Fix 2: Agent Profile Edit Panel
- Added "Agent Profile" section to the agent edit panel (above Rate Limits) with:
  - Display Name — text input (editable)
  - Greeting — text input (editable)
  - System Prompt — textarea (editable)
  - Voice — dropdown populated from `/admin/api/voices` (cached)
  - Save Profile button
- Expanded `GET /admin/api/agents` query to include `voice_id`, `greeting`, `system_prompt`
- New endpoint: `POST /admin/api/agents/:agentId/profile` — partial update of display_name, greeting, system_prompt, voice_id
- Added `saveAgentProfile()` and `populateAgentVoiceDropdowns()` JS functions

#### Fix 3: Channel Identifiers Section
- Added "Channel Identifiers" section in the edit panel (between Profile and Rate Limits)
- Shows read-only Phone, WhatsApp, Email fields with Copy buttons
- Uses existing `copyText()` helper for clipboard + toast

#### Bug Fixes
- Fixed `a.language` → `agent.language` and `a.agent_gender` → `agent.agent_gender` variable naming in agent table forEach loop
- Fixed Copy button syntax error caused by triple-escaped quotes in inline onclick handlers — replaced with `copyText()` helper calls
- The syntax error was killing the entire `<script>` block, making the site unresponsive to clicks

#### Performance: Lazy CDN Loading (DEC-080)
- Removed eager loading of Chart.js (209KB), Swagger UI JS (1.5MB), and Swagger UI CSS (177KB) — ~2MB of render-blocking resources
- Chart.js now loads on-demand when the Dashboard or Analytics tab activates
- Swagger UI (JS + CSS) loads on-demand when the REST API docs section opens
- Added `loadScript()`, `loadCSS()`, `ensureChartJS()`, `ensureSwaggerUI()` helper functions with promise caching
- Initial page load has zero CDN fetches — reduced load time significantly

### Files Modified
- `src/admin/router.ts` — Cache-Control header, expanded agents query, new profile save endpoint
- `src/admin/unified-admin.ts` — Agent Profile section, Channel IDs section, lazy CDN loading, variable naming fix, Copy button fix

## Session 28 — 2026-02-23

### Provider Management System (DEC-079)
- Replaced hardcoded Twilio/Resend/TTS cards in Settings tab with dynamic provider management
- New `src/admin/provider-catalog.ts` — catalog of 11 providers with metadata (descriptions, costs, env key mappings, field definitions)
- Updated `src/admin/env-writer.ts` — added `deleteCredentials()` and `getConfiguredProviders()` functions
- Updated `src/admin/credential-testers.ts` — added 5 new testers: Anthropic, OpenAI, Deepgram, Vonage, LINE
- Added 7 new API endpoints: `GET /providers`, `GET /providers/catalog`, `POST /providers/:id/test`, `POST /providers/:id/save`, `DELETE /providers/:id`, `POST /providers/:id/toggle`, `GET /providers/:id/health`
- Expanded allowed save keys in `POST /admin/api/save` to include all provider env keys
- Added `PROVIDER_*_DISABLED` env vars to `config.ts` for provider toggle support
- Updated `factory.ts` to check disabled flags before initializing providers
- Settings tab UI: provider table with health dots, active toggles, edit/delete buttons; Add Provider modal with two-step flow (catalog grid → configure form)
- Configuration cards (Voice, AI Disclosure, Email Verification, Server) unchanged
- Old test endpoints (`/admin/api/test/twilio`, etc.) kept for backward compatibility
- Fixed OpenAI TTS factory initialization (was passing `voice` instead of `defaultVoice`)
- Tests: 247/247 assertions pass (catalog completeness, deleteCredentials, 7 API endpoints, UI presence, backward compatibility)

## Session 27 — 2026-02-22

### Phase 28 — Agent Channel Blocking (DEC-077)
- Added `blocked_channels` column to `agent_channels` table (JSON: `[]`, `["sms","voice"]`, or `["*"]`)
- Created `src/lib/channel-blocker.ts` — three pure functions: `parseBlockedChannels`, `isChannelBlocked`, `buildBlockedChannels`
- New endpoint: `POST /admin/api/agents/:agentId/blocked-channels` — set/unset blocked channels
- Updated `GET /admin/api/agents` to include `blocked_channels` in response
- Blocked-channel checks added to all 12 communication paths:
  - 3 MCP tools: `send-message`, `make-call`, `send-voice-message` — return error
  - 4 REST endpoints: same tools via REST API — return 403
  - 5 inbound webhooks: `sms`, `voice`, `whatsapp`, `email`, `line` — silently return 200
- Dashboard: renamed "Active Agents" stat → "Provisioned Agents" (shows total count)
- Dashboard: agent status badge shows "Blocked (all)" or "Blocked (sms, voice)" in red when channels blocked
- Dashboard: agent edit panel has channel blocking toggles (Block All + per-channel: sms, voice, email, whatsapp, line)
- Demo data: all agents include `blocked_channels: "[]"`
- New test: `tests/channel-blocking.test.ts` — 41 assertions (unit + API + UI)
- Updated `tests/dashboard.test.ts` — "Provisioned Agents" assertion

### API Key Modal Fixes
- Fixed modal not opening: `\n` inside downloadCSV template literal was interpreted as real newline, breaking the entire `<script>` block. Changed to `\\n`.
- Fixed Show/Hide button overlap: added right padding (60px) to token display so text doesn't flow under the button.

### Documentation Update
- Updated all user-facing docs to reflect current state: channel blocking, dead letter queue, SSE auth, orchestrator rename
- Added version headers to 7 docs files that were missing them
- Updated old references: `comms_get_messages` → `comms_get_waiting_messages`, `messages` table → `dead_letters`, `voicemail_messages` → removed

## Session 26 — 2026-02-21

### SSE Endpoint Authentication (DEC-074, supersedes DEC-032)
- `/sse` endpoint now requires `?token=` query parameter (was completely open)
- Same 3-tier validation as POST `/messages`: orchestrator → org → agent token
- Agent tokens must match `?agentId=` param (impersonation prevention)
- Brute-force tracking: 10 failures → 15-min lockout
- Added `sanitizeUrl()` to logger — redacts `token=` values in logs
- Exported brute-force helpers from `auth-middleware.ts` for SSE handler reuse
- Demo mode skips auth (same as all other endpoints)

### Rename "Master" → "Orchestrator" (DEC-075)
- Renamed `MASTER_SECURITY_TOKEN` → `ORCHESTRATOR_SECURITY_TOKEN` everywhere
- Updated ~40 source files, ~15 test files, ~11 doc files, `.env`, `.env.example`
- Config reads both env vars for backward compat: `ORCHESTRATOR_SECURITY_TOKEN || MASTER_SECURITY_TOKEN`
- UI labels, API descriptions, code comments, error messages all updated
- SQLite system references (`sqlite_master`) left unchanged

### Landing Page Hero Update (DEC-076)
- Changed hero from "Open Communication Infrastructure for AI Agents" to "Orchestrate AI Agent Communication"
- New subtitle: "Phone calls, SMS, email, WhatsApp — provisioned, routed, billed, and compliant. One server, any provider, any agent."

### UI Fix
- Fixed Regenerate button text color in light mode (was black on dark background, now white)

### Files Modified
- `src/index.ts` — SSE auth + orchestrator rename
- `src/security/auth-middleware.ts` — exported brute-force helpers + orchestrator rename
- `src/lib/logger.ts` — added `sanitizeUrl()`
- `src/lib/config.ts` — `orchestratorSecurityToken` with backward compat
- `src/admin/router.ts`, `unified-admin.ts`, `setup-page.ts`, `env-writer.ts`, `openapi-spec.ts` — orchestrator rename + button fix
- `src/security/auth-guard.ts`, `rate-limiter.ts`, `session.ts` — orchestrator rename
- `src/public/auth-api.ts`, `docs.ts`, `landing-page.ts` — orchestrator rename + hero update
- `src/api/rest-router.ts` — orchestrator rename
- 5 test files updated (rate-limiting, security, session-auth, setup-ui, simulator)
- 11 doc files updated (API, CHANGELOG, DECISIONS, INTEGRATION, ONBOARDING, SETUP, TROUBLESHOOTING, TODO, SECURITY, STRUCTURE, references/PROJECT-SCOPE)

## Session 25 — 2026-02-21

### Phase 27 — Dead Letter Queue + Remove Translation (DEC-072, DEC-073)

#### Dead Letter Queue (Part A)
- Renamed/expanded `voicemail_messages` → `dead_letters` table covering all channels (voice, SMS, email, WhatsApp, LINE)
- Messages only stored on failure: `agent_offline`, `send_failed`, `provider_error`
- Successful sends and successful inbound deliveries store nothing (privacy-first)
- Created `comms_get_waiting_messages` tool — fetch = acknowledge pattern, auto-purge after 7 days
- Created `src/tools/waiting-messages.ts` and `src/db/schema-dead-letters.sql`
- Created `src/lib/message-dispatcher.ts` — dispatches pending dead letters when agent reconnects via SSE
- Removed `messages` table entirely from schema — conversation storage is the agent's responsibility
- Removed `src/tools/get-messages.ts` (replaced by `comms_get_waiting_messages`)
- Removed `src/lib/voicemail-dispatcher.ts` (replaced by `message-dispatcher.ts`)
- Removed `src/db/schema-voicemail.sql` (replaced by `schema-dead-letters.sql`)
- Updated `org-manager.ts` cascade delete and `compliance.ts` GDPR erasure to use `dead_letters`
- Usage stats remain in `usage_logs` (counts and costs only, no message content)
- Data retention: `DEAD_LETTER_RETENTION_DAYS` (default 7) replaces separate messages/voicemail retention

#### Remove Server-Side Translation (Part B)
- Removed `targetLanguage` parameter from `comms_send_message` and `comms_make_call` tools
- Removed `translate()` and `getAgentLanguage()` calls from tool handlers and webhook handlers
- Removed translation toggle UI from admin settings panel
- Removed `TRANSLATION_ENABLED` config and dashboard translation service display
- Kept `src/lib/translator.ts` module for future human-to-human bridging use
- Agent's `language` column retained (used for voice STT/TTS language)

#### Production Code Changes
- `src/db/migrate.ts` — removed `messages` from org tables, removed messages ALTER TABLE statements
- `src/db/schema.sql` — removed `messages` table and its index
- `src/lib/org-manager.ts` — cascade delete uses `dead_letters` instead of `messages` + `voicemail_messages`
- `src/security/compliance.ts` — GDPR erasure uses `dead_letters` instead of `messages` + `voicemail_messages`
- `src/lib/sandbox-responder.ts` — updated comment to reflect privacy-first design
- `src/lib/data-retention.ts` — `deadLetterRetentionDays` (7d) replaces `messagesRetentionDays` (90d) and `voicemailRetentionDays` (30d)

#### Test Updates (12 test files, 335+ assertions pass)
- Updated 18 test files to remove `messages` table references and `comms_get_messages` calls
- Replaced DB verification with `usage_logs` checks across all channel tests
- Voice tests: `voicemail_messages` → `dead_letters` with new field names
- Compliance test: GDPR erasure uses `dead_letters`
- Translation test: rewritten to verify features are properly REMOVED
- Regulatory compliance test: `deadLetterRetentionDays` replaces separate message/voicemail retention
- End-to-end test: `comms_get_messages` → `comms_get_waiting_messages`

#### Documentation
- Updated `docs/TODO.md` — Phase 27 items A1-A12, B1-B6 marked done
- Updated `docs/INTEGRATION.md` — dead letter model section, `comms_get_waiting_messages` in feature table
- Updated `docs/SPEC.md` — removed Translation & Language section, updated MCP Tools and Database tables
- Updated `docs/CHANGELOG.md` — this entry

## Session 24 — 2026-02-19

### Simplify Third-Party Integration (DEC-067 through DEC-070)
- Community/enterprise editions now auto-approve accounts on email verification (no KYC gate)
- KYC fields (company, website, use case) hidden for non-SaaS editions
- Pending accounts endpoint returns empty for non-SaaS editions
- Added API Key card to admin dashboard with copy and regenerate buttons
- Added `GET /admin/api/my-token` and `POST /admin/api/regenerate-token` endpoints
- Created `src/lib/llm-adapter.ts` — plug-and-play LLM interface (Anthropic, OpenAI, custom endpoint)
- Created `src/lib/sandbox-responder.ts` — fire-and-forget simulated replies after sandbox sends
- All mock providers (SMS, email, WhatsApp, LINE) now use realistic Twilio-format IDs (SM, CA, PN, EM, WA, LN)
- Added sandbox config vars: `SANDBOX_LLM_ENABLED`, `SANDBOX_LLM_ENDPOINT`, `SANDBOX_REPLY_DELAY_MS`
- Sandbox reply hook added to send-message tool (MCP + REST) for all 4 channels
- Created `docs/INTEGRATION.md` — orchestrator integration guide
- Updated `/docs/integration` web page with new content
- Added `GET /api/v1/integration-guide` endpoint (public, returns raw markdown)
- Updated `tests/send-message.test.ts` to match realistic mock ID format
- Updated `tests/onboarding-flow.test.ts` to match edition-aware KYC behavior
- New test suite: `tests/third-party-integration.test.ts` — 40/40 pass

## Session 23 — 2026-02-19

### Session-Based Auth for Admin Panel (DEC-066)
- Added `src/security/session.ts` — encrypted session cookie module (AES-256-CBC)
- Login and email verification now set `__bd_session` cookie and redirect to `/admin`
- Removed token reveal screen and "What's Next" guide from auth page
- Admin middleware checks session cookie before Bearer token (backward compatible)
- Added `POST /auth/api/logout` to clear session cookie
- Admin panel tries cookie auth on load, falls back to token-based login for super-admins
- Logout now clears cookie server-side and redirects to `/auth/login`
- Added inline cookie parser middleware to `index.ts`
- Tests: 33/33 pass (8 admin-rejection tests skipped in demo mode)

## Session 22 — 2026-02-19

### Landing Page Updates
- Added "Open" to hero headline: "Open Communication Infrastructure for AI Agents"
- Removed "Not a wrapper around Twilio" from subtitle
- Rewrote "Privacy First" card with accurate features (AES-256 encryption, no content storage, redacted logs)
- Replaced "Configurable markup for deployers" with "Offshore communication at local prices"
- Replaced "Unified Conversation Threading" card (was inaccurate) with Privacy First card
- Changed architecture diagram arrows to bidirectional, all 4 cards on one row
- Applied `white-space: nowrap` to prevent "Infrastructure" from breaking across lines

### Legal Pages
- Fixed CSP blocking inline styles on `/legal/*` pages (added to public page CSP rule)
- Added scroll-to-top button (appears after 300px scroll)
- Added "Back to Home" link in legal nav bar

### Auth Flow
- Registration no longer creates account until email is verified with OTP
- Pending registrations stored in memory (10-min expiry)
- Account + org created only after valid OTP verification
- Renamed "Organization Name" to "Account Name", auto-fills from email
- Removed Company Name, Website, Use Case fields from registration form
- Added "Back to fix email" link on verify screen
- Added "Resend code" button with 60-second cooldown
- Added `/auth/api/resend-code` endpoint

### Decisions
- DEC-065: Community edition — single user role (sysadmin = account user, same interface)

### Deployed
- Pushed to both remotes (origin + work) at commit `a0ef17c`

### Open Items
- "You're All Set" token screen needs discussion — unclear purpose for community edition
- SaaS future: provider disclaimer, arbitration clause, provider terms links, onboarding visual, trust stats

## Session 21 — 2026-02-18

### Phase 24 — Third-Party MCP Onboarding (44/44 tests pass)

Completes the full onboarding story for external agent systems: register → sandbox → provision agents → test → get approved → go production.

#### Registration Form — KYC Fields & ToS
The registration form now includes Company Name, Website, Use Case description (all optional), and a required Terms of Service checkbox with links to `/legal/terms` and `/legal/aup`. A brief explanation tells users why the optional fields are collected and links to the Privacy Policy. The backend already accepted these fields — this connects the frontend.

#### Org Status API
New `GET /admin/api/my-org` endpoint returns the caller's organization info: role (super-admin or org-admin), org ID, name, mode (sandbox/production), account status (pending_review/approved/suspended), agent count, and pool capacity. Used by the dashboard to show banners and provisioning limits.

#### Sandbox/Production Banner
The admin dashboard now shows a status banner at the top based on org status: yellow for sandbox+pending review, blue for sandbox+approved, red for suspended. Super-admins and demo mode see no banner. Production orgs see no banner.

#### Agent Provisioning UI
The Agents tab now has a "+ New Agent" button that reveals a provision form (Agent ID, Display Name, country, capabilities checkboxes, system prompt, greeting). On success, a token reveal modal shows the security token once with a copy button and "cannot be recovered" warning. Each agent row has a deprovision button (X) with confirmation dialog. Pool capacity display shows "X of Y slots used".

#### Post-Registration Guide
After the token reveal on the auth page, a numbered "What's Next" guide walks users through 7 steps: copy token → sign into admin → understand sandbox → provision first agent → test with simulator → read integration guide → await review.

#### Channel Setup Documentation
New `docs/CHANNEL-SETUP.md` with comprehensive setup guides for all 5 channels (SMS, Voice, Email, WhatsApp, LINE) covering inbound, outbound, two-way messaging, webhook URLs, provider configuration, compliance checks, and number pool routing.

#### Integration Guide & Channel Setup Pages
Two new pages on the docs site: `/docs/integration` (full walkthrough from registration to production with Node.js and Claude Desktop code examples) and `/docs/channel-setup` (quick overview linking to the detailed doc).

#### Files Changed
- `src/public/auth-page.ts` — KYC fields, ToS checkbox, privacy explanation, What's Next guide
- `src/admin/router.ts` — `GET /admin/api/my-org` endpoint
- `src/admin/unified-admin.ts` — org-banner, provision form, token modal, deprovision button, pool capacity
- `src/public/docs.ts` — integration guide and channel-setup pages added to docs site
- `docs/CHANNEL-SETUP.md` — new file
- `tests/onboarding-flow.test.ts` — new file, 44 assertions

---

## Session 20 — 2026-02-18

### Phase 25 — Regulatory Compliance & Distribution Model (84/84 tests pass)

Before this phase, the server had no distribution packaging, no legal pages, no consent tracking, no per-country compliance rules, and no data retention. This phase adds the full compliance and distribution layer needed before opening the platform to external users.

#### Distribution Model — 3-Tier Packaging
The server now ships in three editions: **Community** (MIT, free, all core tools), **Enterprise** (adds onboarding, billing, org management), and **SaaS** (hosted managed service). Controlled by the `EDITION` env var. At startup, `server.ts` checks the edition and only registers enterprise/saas tools (onboard-customer, billing, org-management) when the edition allows it. Community gets everything except those admin tools.

New files: `LICENSE` (MIT), `ENTERPRISE.md` (tier comparison).

#### Legal Pages — Terms, AUP, Privacy
Three HTML pages served at `/legal/terms`, `/legal/aup`, `/legal/privacy`. Each covers the legal obligations for the platform — Terms of Service (TCPA, indemnification, liability limits), Acceptable Use Policy (prohibited uses like spam, harassment, fraud), and Privacy Policy (GDPR, CCPA, data handling). All pages use the same dark theme as the rest of the admin UI, and cross-link to each other. The landing page footer now links to all three.

New file: `src/public/legal-pages.ts`.

#### Country Compliance Rules — 37 Countries
A rules engine (`src/lib/country-compliance.ts`) that maps ISO country codes to regulatory requirements. Each country rule specifies: whether consent is required, whether A2P SMS registration is needed, whether DNC list checking is required, calling hours restrictions (e.g., US: 8am-9pm), whether recording consent announcements are needed, and which regulations apply (TCPA, GDPR, CASL, etc.).

Covers 12 countries with detailed rules (US, CA, GB, DE, FR, IL, AU, JP, BR, IN, SG, AE) plus 25 EU member states with shared GDPR/ePrivacy rules. Unknown countries get safe defaults (require consent, honor opt-out).

**Provisioning now validates country rules** — if you try to provision in the US without A2P 10DLC registration, provisioning is blocked with a clear error. Warnings are returned for missing DNC access, consent tracking, calling hours, and recording consent.

#### Consent Tracking — Record, Revoke, Check, Enforce
Three new MCP tools let agents manage consent:
- **`comms_record_consent`** — records that a contact gave consent for a specific channel (sms/voice/email/whatsapp). Stores consent type (express, implied, transactional), source (web_form, verbal, sms_optin), and notes. Supports upsert — re-recording over a revoked consent re-grants it.
- **`comms_revoke_consent`** — marks consent as revoked. The contact can no longer be contacted on that channel.
- **`comms_check_consent`** — returns current consent status, type, grant/revoke timestamps, and source.

**Pre-send enforcement:** The existing `preSendCheck()` in `compliance.ts` now checks consent before every outbound message. If the agent has no active consent for the contact+channel, the send is blocked with a clear error message.

**STOP keyword:** When an inbound SMS contains "STOP", "UNSUBSCRIBE", "CANCEL", "END", or "QUIT", the system automatically revokes consent for that sender on SMS and adds them to the DNC list. A confirmation TwiML response is sent back.

New file: `src/tools/consent-tools.ts`. New table: `contact_consent` (tracks consent lifecycle per agent/contact/channel with timestamps).

#### Sandbox-to-Production Gating
Organizations now have a `mode` column: `sandbox` or `production`. Sandbox orgs get mock providers (no real API calls, no charges). Production mode requires admin approval.

New users must accept Terms of Service at registration and provide KYC fields: company name, website, and use case description. Accounts start as `pending_review`. Admin endpoints (`GET /admin/api/pending-accounts` and `POST /admin/api/pending-accounts/:userId/review`) let super-admins approve, reject, or suspend accounts. Approving an account auto-upgrades the org to production mode.

New table: `country_terms_accepted`. Modified: `organizations` table (added `mode`), `user_accounts` (added `tos_accepted_at`, `company_name`, `website`, `use_case_description`, `account_status`).

#### Twilio Messaging Service SID
Added `TWILIO_MESSAGING_SERVICE_SID` config. When set, outbound SMS sends through the Twilio Messaging Service (needed for A2P 10DLC compliance) instead of a raw From number.

#### Data Retention — Auto-Purge
A new module (`src/lib/data-retention.ts`) runs daily and deletes old data from the database based on configurable retention periods:
- Messages: 90 days
- Usage logs: 365 days
- Call logs: 365 days
- Voicemail: 30 days
- OTP codes: 1 day
- Revoked consent records: 730 days (2 years, kept for audit)

Runs on a 24-hour interval with an initial 30-second delay after server start. Can be disabled entirely with `DATA_RETENTION_ENABLED=false`. Each table's retention is independently configurable via env vars.

#### Tests
84 assertions across 7 test sections: legal pages (render, links, cross-links), country compliance (US/CA/GB/IL rules, EU membership, validation), consent tracking (record/revoke/check lifecycle, DB verification), sandbox gating (org mode, provider factory), edition gating (tool availability), data retention (config defaults, cleanup execution, disabled mode), and full regression (ping, send message, get messages, health, metrics, KYC fields).

New file: `tests/regulatory-compliance.test.ts`.

## Session 19 — 2026-02-17

### Number Pool + Smart Routing (DEC-059)
- **New file:** `src/db/schema-number-pool.sql` — `number_pool` table with country_code, capabilities, is_default, org_id
- **New file:** `src/lib/number-pool.ts` — country detection (~50 countries from E.164 prefix) + smart number selection (same-country → default → any → agent fallback)
- **New file:** `tests/number-pool.test.ts` — 21 assertions (12 unit + 2 DB + 4 integration + 2 regression)
- **Modified:** `src/db/migrate.ts` — loads number pool schema
- **Modified:** `src/db/seed.ts` — seeds US (+18452514056, default) and IL (+97243760273) into pool
- **Modified:** `src/tools/send-message.ts` — SMS routing uses `resolveFromNumber()` from pool
- **Modified:** `src/tools/make-call.ts` — voice call routing uses `resolveFromNumber()` from pool
- **Modified:** `src/tools/send-voice-message.ts` — voice message routing uses `resolveFromNumber()` from pool
- **Backward compatible:** empty pool = same behavior as before (agent's own number used)

### Marketing Overview Document
- **New file:** `docs/MARKETING-OVERVIEW.md` — investor/evangelist-facing document covering capabilities, market case, architecture, revenue model, and current build status. All claims validated against actual codebase and test results.

## Session 18 — 2026-02-17

### Live Call Testing & Bug Fixes
- **CSP fix:** Admin page Content-Security-Policy was blocking Chart.js and Swagger UI CDNs — added `cdn.jsdelivr.net` and `unpkg.com` to allowed sources for admin routes
- **TCPA timezone:** Added `recipientTimezone` parameter to `comms_make_call` + auto-detection from phone prefix (+972→Asia/Jerusalem, +852→Asia/Hong_Kong, +81→Asia/Tokyo, etc.). Demo mode skips TCPA entirely (mock calls don't ring)
- **Credential protection:** Provisioning test now backs up and restores `.env` around `comms_register_provider` calls — real Twilio credentials no longer wiped by test suite
- **Demo data:** Added Snir (+972502629999, sz@aidg.com) as top contact in demo dashboard data
- **Agents seeded:** snir-agent (+972502629999→+18452514056), kelvin-agent (+85291511443), test-agent-001
- **Live calls verified:** Successfully called Snir (Israel), Kelvin (Hong Kong), Igor (Japan) via real Twilio. WebSocket voice conversation confirmed working. Live TwiML injection (say message on active call) confirmed working
- **Twilio credentials:** Real SID/token restored in `.env`, US number +18452514056 and IL number +97243760273 configured

## Session 17 — 2026-02-16

### Phase 22 — Dynamic Language + Real-Time Translation
- **New file:** `src/lib/translator.ts` — translation engine using Anthropic API (Claude Haiku)
- **Config:** `TRANSLATION_ENABLED` boolean (default: false), reuses `ANTHROPIC_API_KEY`
- **DB migration:** `language` column on `agent_channels`, `body_original` + `source_language` on `messages`
- **Voice translation bridge:** inbound transcription translated caller→agent language, outbound response translated agent→caller language
- **SMS/WhatsApp translation:** auto-detect incoming message language, translate to agent's language, store original
- **Inbound voice:** agent's language used for TwiML instead of global default
- **MCP tools:** `targetLanguage` param on `comms_make_call` and `comms_send_message` for outbound translation
- **Admin UI:** language dropdown in agent edit panel, translation toggle card in settings, status badge
- **Admin API:** `POST /admin/api/agents/:agentId/language`, `TRANSLATION_ENABLED` in save list, translation service in dashboard
- **Tests:** 33/33 translation tests pass, 49/49 end-to-end regression pass

## Session 16 — 2026-02-16

### Phase 21 — Multi-Tenant Organization Isolation
- **Login bug fix:** CSS specificity fix — `.login-box button[type="submit"]` prevents eye toggle overlap
- **Organization tables:** `organizations` + `org_tokens` tables (schema-org.sql)
- **Migration:** `org_id TEXT DEFAULT 'default'` added to 15 data tables, default org created
- **Org manager:** CRUD + token management (org-manager.ts) — create, list, delete orgs, generate/verify/revoke org tokens
- **3-tier auth:** super-admin (orchestrator token) → org-admin (org token) → agent (agent token) in auth-middleware.ts + auth-guard.ts
- **Org-scope helpers:** orgFilter, orgWhere, requireAgentInOrg (org-scope.ts)
- **Tool scoping:** 16 tool files updated with org_id in INSERT/WHERE clauses
- **Webhook scoping:** 5 webhook files updated with org_id lookups on inbound messages
- **Lib scoping:** compliance, audit-log, rate-limiter, billing — all org-scoped
- **Admin API scoping:** Dashboard, agents, usage-history queries filter by org_id. Admin auth supports org tokens
- **New MCP tools:** `comms_create_organization` + `comms_list_organizations` (super-admin only)
- **Token manager:** Updated to store/return org_id on agent tokens
- **Tests:** 50/50 multi-tenant assertions pass
- **Regression:** 47/49 end-to-end pass (2 failures = TCPA time-of-day, not related)

## Session 15 — 2026-02-16

### Phase 13 — Advanced Voice
- `comms_transfer_call` tool: transfer live calls to phone numbers or other agents
- `call_logs` table with duration, cost, recording URL, transfer tracking
- Deepgram STT adapter + mock STT for demo mode
- OpenAI TTS adapter
- PCM ↔ mu-law 8kHz audio converter with WAV header generation
- Call status callback route for Twilio updates
- 26/26 tests pass

### Phase 14 — Provider Adapters
- Vonage telephony adapter (full: SMS, calls, transfers, number management)
- S3 storage adapter with AWS Signature V4 (zero-dependency)
- R2 storage adapter (Cloudflare, wraps S3)
- Turso/libSQL database adapter
- Convex database adapter
- `comms_register_provider` extended to 10 providers
- 42/42 tests pass

### Phase 15 — Swagger + API Explorer
- OpenAPI 3.1 spec generator (all REST paths, security schemes, MCP tools)
- Swagger UI at `/admin/api-docs` (CDN-based, dark theme)
- Demo scenario runner (5 scenarios → later expanded to 8)
- 29/29 tests pass

### Phase 16 — Admin Dashboard
- Dashboard page at `/admin/dashboard` (agents, usage, costs, alerts)
- Dashboard data API at `/admin/api/dashboard`
- Auto-refresh every 30 seconds
- 17/17 tests pass

### Phase 17 — Compliance
- Content filtering (threats + profanity blocked via regex)
- DNC list enforcement (blocks SMS, email, and voice)
- TCPA time-of-day (8 AM–9 PM, timezone-aware)
- Recording consent (two-party consent state detection)
- CAN-SPAM (unsubscribe check, warning only)
- GDPR right-to-erasure (deletes data from all tables)
- Compliance wired into `comms_send_message` and `comms_make_call`
- 27/27 tests pass

### Phase 18 — Billing & Markup
- Configurable markup percentage (global + per-agent)
- 4-tier system (free/starter/pro/enterprise) with preset limits
- `comms_get_billing_summary` tool (provider cost vs billed cost)
- `comms_set_billing_config` tool (tier, markup, billing email)
- Spending alerts at 80% of daily/monthly cap
- `billing_config` table
- 36/36 tests pass

### Phase 19 — Documentation
- README.md rewritten (quick start, tool listing, tech stack)
- 8 new doc files: SETUP.md, API.md, MCP-TOOLS.md, PROVIDERS.md, SECURITY.md, OBSERVABILITY.md, ARCHITECTURE.md, TROUBLESHOOTING.md
- 52/52 tests pass

### Phase 20 — Polish
- `comms_expand_agent_pool` tool (resize pool)
- Conversation threading (contactAddress filter in `comms_get_messages`)
- Demo scenarios expanded to 8 (added dashboard, security headers, dashboard page)
- Comprehensive end-to-end test (49 assertions covering all features)
- 49/49 tests pass

### Summary
- Phases 13–20 completed (all remaining phases)
- 8 new test files, 278 new test assertions
- 16 MCP tools total
- All phases pass dry tests in demo mode

## Session 14 — 2026-02-15

### Phase 8 — Configuration Architecture & Customer Onboarding (DEC-044, DEC-045)

#### New Files (2)
- `src/tools/onboard-customer.ts` — unified `comms_onboard_customer` admin tool: provisions all channels, generates email DNS records, returns complete setup package (security token, channels, DNS records, webhook URLs, SSE instructions)
- `tests/onboarding.test.ts` — dry test for config architecture and onboarding flow

#### Modified Files (4)
- `src/lib/config.ts` — added `identityMode`, `isolationMode` config fields with defaults (dedicated, single-account) + startup warnings for unsupported modes
- `src/tools/provision-channels.ts` — added guard rejecting unsupported identity/isolation modes
- `src/server.ts` — registered `comms_onboard_customer` tool
- `src/admin/router.ts` — added `IDENTITY_MODE`, `ISOLATION_MODE` to save whitelist
- `.env.example` — added "Configuration Architecture" section

### Phase 12 — Attack Hardening (DEC-046 through DEC-049)

#### New Files (6)
- `src/security/security-headers.ts` — X-Frame-Options DENY, CSP, nosniff, XSS-Protection, Referrer-Policy, HSTS (production only), relaxed CSP for admin paths
- `src/security/cors.ts` — CORS middleware with configurable origins (falls back to webhookBaseUrl), OPTIONS preflight 204
- `src/security/http-rate-limiter.ts` — in-memory per-IP + global HTTP rate limiting, configurable limits, 60s cleanup
- `src/security/ip-filter.ts` — IP allowlist/denylist factory for admin + webhook scopes, empty allowlist = allow all
- `src/security/anomaly-detector.ts` — volume spike (3x threshold), brute-force (>10/5min), rapid token rotation (>3/hour), fires alerts
- `tests/attack-hardening.test.ts` — dry test for all security middleware (headers, CORS, rate limiter, IP filter, replay, anomaly)

#### Modified Files (6)
- `src/index.ts` — wired trust proxy, security headers, CORS, HTTP rate limiter, IP filter, anomaly detector, body size limits (1MB)
- `src/security/auth-middleware.ts` — added brute-force lockout (10 failures → 15-min 429), failed auth tracking, reset on success
- `src/security/webhook-signature.ts` — added replay prevention nonce cache (5-min TTL, 60s cleanup)
- `src/admin/router.ts` — added `adminAuth` middleware on all POST routes, imported config + logger
- `src/admin/setup-page.ts` — all fetch() calls now include `Authorization: Bearer <token>` when orchestrator token field has value
- `src/lib/config.ts` — added `corsAllowedOrigins`, `httpRateLimitPerIp`, `httpRateLimitGlobal`, `adminIpAllowlist`, `webhookIpAllowlist`, `ipDenylist`, `anomalyDetectorEnabled`
- `.env.example` — added "Security Hardening" section

#### Test Results
- `tests/onboarding.test.ts` — 31/31 passed
- `tests/attack-hardening.test.ts` — 33/33 passed
- `npm run build` — clean compile

#### Session End State
- **Completed:** Phase 8 (config architecture + onboarding) and Phase 12 (attack hardening) fully implemented and tested
- **`.env` restored to:** `DEMO_MODE=false` (was temporarily `true` for tests)
- **Server:** not running (was stopped after tests)
- **Next up:** Phase 12 verify item (live replay/flood/anomaly testing), then Phase 13 (Advanced Voice) or Phase 15 (Swagger)
- **No uncommitted work** — all changes are saved but not git-committed yet (developer should review and commit)

---

## Session 13 — 2026-02-15

### MCP Onboarding — Required Fields (DEC-043)

#### New Files (2)
- `docs/ONBOARDING.md` — user-facing guide: what this server does, prerequisites, setup, provider configuration, connecting an AI agent (SSE + tools), channel requirements, voice architecture
- `tests/setup-ui.test.ts` — 24 assertions: ProviderStatus shape (5 sections), mask function, saveCredentials, admin API status/save/test endpoints, setup page HTML cards

#### Modified Files (6)
- `src/admin/env-writer.ts` — expanded `ProviderStatus` with `resend`, `server`, and `voice` sections; `getProviderStatus()` returns masked values for all providers
- `src/admin/credential-testers.ts` — added `testResendCredentials()` (GET /domains with Bearer auth, same pattern as ElevenLabs)
- `src/admin/router.ts` — expanded allowed keys (Resend, server, voice, Anthropic), added `POST /admin/api/test/resend` route
- `src/admin/setup-page.ts` — removed 5-step wizard indicator, added 3 new cards (Resend with Test button, Server Settings with Save button, Voice Defaults with Save button), each with status badges, added `directSave()` helper for cards without external API test
- `src/lib/config.ts` — replaced inline security warning with `logStartupWarnings()` function (6 checks: Twilio, Resend, localhost webhook, orchestrator token, ElevenLabs, Anthropic)
- `src/db/seed.ts` — test agent now includes `email_address`, `system_prompt`, `greeting`; inserts `spending_limits` row; prints summary to console

#### Verification
- Build passes clean
- 24/24 test assertions pass (9 unit + 15 integration)

---

## Session 12 — 2026-02-15

### Voice Refactor — Agent Responds, Not the Server (DEC-042)

#### New Files (3)
- `src/lib/agent-registry.ts` — maps agentId → MCP server session (register/unregister/get)
- `src/lib/voicemail-dispatcher.ts` — dispatches pending voicemails as logging notifications when agent reconnects
- `src/db/schema-voicemail.sql` — `voicemail_messages` table (id, agent_id, call_sid, caller_from/to, transcript, message, preferences, status)

#### Modified Files (6)
- `src/webhooks/voice-ws.ts` — replaced direct Anthropic LLM call with 3-path flow: (A) MCP sampling to connected agent, (B) Anthropic answering machine fallback, (C) hard-coded "unavailable" message. Stores voicemail on WebSocket close in answering-machine mode.
- `src/webhooks/voice-sessions.ts` — added `mode: "agent" | "answering-machine"` and optional `voicemailCollected` to VoiceConversation
- `src/index.ts` — SSE endpoint accepts `agentId` query param, registers/unregisters agent sessions, dispatches pending voicemails on connect
- `src/tools/register-provider.ts` — removed `anthropic` from provider list (z.enum, PROVIDER_CONFIGS, verification). Anthropic key kept in config as optional for answering machine only.
- `src/db/migrate.ts` — added voicemail schema migration
- `tests/voice-call.test.ts` — updated expectations (fallback = "unavailable" message, not demo text), added voicemail DB storage test

#### How It Works Now
- **Agent connected:** Voice call transcripts route via MCP sampling (`server.createMessage()`) to the connected AI agent's LLM. The agent has context and provides responses.
- **No agent:** Anthropic answering machine greets caller, collects message + preferences, stores voicemail in DB. When agent reconnects via SSE, pending voicemails are dispatched as logging notifications.
- **No agent + no Anthropic key:** Hard-coded "No one is available" message.
- Mode is set at call setup time and persists for the call. If sampling times out (8s), call switches to answering-machine mode.

#### Verification
- TypeScript compiles clean (`npx tsc --noEmit`)
- Tests updated for new behavior

---

## Session 11 — 2026-02-15

### Phase 11: Observability & Admin Alerts
- Created `audit_log` table with SHA-256 hash chain (schema-observability.sql)
- Built Prometheus-compatible metrics collector (counters, gauges, text format)
- Added `/metrics` endpoint returning Prometheus text format
- Upgraded `/health/ready` with real DB ping + config presence checks
- Built audit log module (append, verify chain, query with filters)
- Built WhatsApp alerter (sends formatted admin alerts, never throws)
- Built alert manager (severity routing: CRITICAL/HIGH→WhatsApp+log+audit, MEDIUM→log+audit, LOW→log)
- Wired metrics into send-message (mcp_messages_sent_total per channel)
- Wired alerts into rate-limiter (fires MEDIUM alert on breach)
- Wired audit log into provision/deprovision tools
- Added uptime gauge to index.ts (15-second interval)
- Added admin WhatsApp config fields (ADMIN_WHATSAPP_NUMBER, ADMIN_WHATSAPP_SENDER)
- Test suite: 26/26 assertions pass (DEC-038 through DEC-041)

## Session 10 — 2026-02-15

### Phase 10: Rate Limiting & Cost Tracking
- Created `usage_logs` table with indexes for rate checking and cost tracking
- Built rate limiter utility (checkRateLimits, logUsage, updateUsageCost, getAgentLimits)
- Integrated rate checks + usage logging into send-message, make-call, send-voice-message tools
- Created `comms_set_agent_limits` tool (admin-only, partial update of spending limits)
- Created `comms_get_usage_dashboard` tool (per-agent stats, costs, limits)
- Provisioning now creates default spending_limits row; deprovision deletes it
- Eliminated planned `rate_limits` and `contact_frequency` tables — both derived from `usage_logs`
- 27/27 unit test assertions pass (rate-limiting.test.ts)

## Session 1 — 2026-02-12

### Project Setup
- Created project docs structure (docs/, docs/references/)
- Wrote SPEC.md (v1.2) — full project specification with configurable architecture
- Wrote TODO.md (v2.1) — 21 phases, "small wins" build order (infrastructure → POC → MVP → features)
- Wrote DECISIONS.md (v2.0) — 12 architecture decisions logged
- Created MENU.md (v1.1) — 6 menu actions
- Created .env.example — dev-friendly defaults (SQLite, Edge TTS, GreenAPI)

### Reference Documents Saved
- PROJECT-SCOPE.md — original project scope (MCP server for AI agent communication)
- ai-voice-agent-architecture.md — ConversationRelay vs Media Streams vs ElevenLabs Native
- twilio-mcp-serverless-deploy.md — Twilio's official MCP serverless deployment pattern
- dynamic-comms-architecture.md — dynamic provisioning, identity models, WhatsApp strategy

### Key Decisions Made
- DEC-001 to DEC-007: All configurable with sensible defaults (identity, WhatsApp, isolation, voice, threading, billing, media)
- DEC-008: Default stack — Twilio, Resend, ElevenLabs/WAPI, Neon
- DEC-009: "Shallow first" development philosophy
- DEC-010: GreenAPI for dev WhatsApp, Twilio pool for production
- DEC-011: Edge TTS (free) for dev, ElevenLabs/WAPI for production
- DEC-012: Start lean — only set up providers when their phase arrives

### Open Questions
- Twilio credentials not yet verified (needed for Phase 2)

---

## Session 1 (continued) — Phase 1 Progress

### Phase 1 — Infrastructure & Verification
- Created full project folder structure (src/, tests/, scripts/, 13 subdirectories)
- package.json with dependencies: MCP SDK, Express 5, better-sqlite3, zod, dotenv, TypeScript
- tsconfig.json — ES2022 target, Node16 modules, strict mode
- Config loader (src/lib/config.ts) — zod-validated .env loading with all provider selectors
- Structured logger (src/lib/logger.ts) — JSON output, level filtering, no PII
- Shared types (src/lib/types.ts) — AgentChannel, Message, AgentPool
- Provider interfaces (src/providers/interfaces.ts) — all 8 interfaces defined (ITelephonyProvider, IEmailProvider, IWhatsAppProvider, ITTSProvider, ISTTProvider, IVoiceOrchestrator, IDBProvider, IStorageProvider)
- Provider factory (src/providers/factory.ts) — resolves config to adapter, SQLite working
- SQLite DB client (src/db/client.ts) — implements IDBProvider, WAL mode, auto-creates data dir
- Schema migration (src/db/schema.sql + src/db/migrate.ts) — agent_channels, messages, agent_pool tables
- MCP server (src/server.ts) — registers comms_ping dummy tool, queries agent pool
- Express server (src/webhooks/router.ts) — /health and /health/ready endpoints
- Entry point (src/index.ts) — starts MCP (SSE transport) + Express on same port
- TypeScript build passes clean
- Bug fix: schema.sql path resolution (dist/ vs src/)

### Status
- 9/10 Phase 1 tasks complete
- Remaining: final verify (server start + /health + MCP tool listing)

---

## Session 2 — 2026-02-13

### Phase 0 — Setup UI for Credentials
- Created setup page at `/admin/setup` with dark-themed card-based UI
- Two provider cards: Twilio (Account SID + Auth Token) and ElevenLabs (API Key)
- "Test Connection" buttons call real APIs (Twilio REST, ElevenLabs voices endpoint)
- Successful test auto-saves credentials to `.env` (no separate Save step)
- "Deploy" button restarts the server (spawns new process, polls until back)
- Password fields with show/hide toggle, masked placeholders for configured values
- Step indicator at top (foundation for future wizard steps)
- Added `elevenlabsApiKey` and `elevenlabsDefaultVoice` to config schema

### New Files
- `src/admin/env-writer.ts` — atomic .env read/write
- `src/admin/credential-testers.ts` — Twilio + ElevenLabs API testers
- `src/admin/setup-page.ts` — full HTML page (inline CSS/JS)
- `src/admin/router.ts` — Express routes for admin UI + API

### Modified Files
- `src/index.ts` — mounted admin router
- `src/lib/config.ts` — added ElevenLabs config fields

### Phase 1 — Final Verification
- Fixed MCP body parser bug (express.json() was consuming stream before transport)
- Moved MCP routes before body parsers in index.ts
- Verified: /health returns 200, DB connects, MCP client lists comms_ping tool
- **Phase 1 complete**

### Decisions
- DEC-013: Test = Save, Deploy button restarts server
- DEC-014: Dry test first, live API calls only when crucial

---

## Session 3 — 2026-02-13

### Phase 2 — First Small Win: Send an SMS

#### New Files
- `src/providers/telephony-mock.ts` — mock telephony adapter (demo mode, returns fake SMS results)
- `src/providers/telephony-twilio.ts` — real Twilio adapter (sendSms via REST API + Basic Auth)
- `src/tools/send-message.ts` — `comms_send_message` MCP tool (lookup agent, send SMS, log to DB)
- `src/db/seed.ts` — test agent seeder (idempotent, `npm run seed`)
- `tests/send-message.test.ts` — dry test (21 assertions, connects via MCP SSE)

#### Modified Files
- `src/providers/factory.ts` — wires up telephony (demo → mock, Twilio creds → Twilio, fallback → mock)
- `src/server.ts` — registers comms_send_message tool
- `package.json` — added `seed` script

#### Verification
- Build passes clean
- Seed inserts test agent (idempotent)
- Server boots with mock adapter in demo mode
- Dry test: 21/21 assertions pass (tool listing, send, DB record, error handling)
- Live test pending (needs Twilio phone number purchase)

### Spec Update
- Added "Concurrency Architecture" section to SPEC.md (v1.4) — unlimited concurrent communications requirement

---

## Session 4 — 2026-02-14

### Phase 3 — Small Win: Receive an SMS

#### New Files
- `src/webhooks/inbound-sms.ts` — Twilio inbound SMS webhook handler (parse body, find agent, store message, forward to callback, return TwiML)
- `src/tools/get-messages.ts` — `comms_get_messages` MCP tool (list messages by agent, optional channel filter, newest first)
- `tests/inbound-sms.test.ts` — dry test (20 assertions: webhook response, DB storage, MCP tool retrieval, error cases)
- `tests/live-inbound-sms.test.ts` — live test (ngrok tunnel, Twilio webhook config, real SMS verification, cleanup)

#### Modified Files
- `src/webhooks/router.ts` — added `POST /webhooks/:agentId/sms` route
- `src/server.ts` — registered `comms_get_messages` tool
- `src/providers/telephony-twilio.ts` — implemented `configureWebhooks()` (look up phone SID, update SMS/voice URLs)

#### Verification
- Build passes clean
- Dry test: 20/20 assertions pass (simulated Twilio webhook)
- Live test: real SMS received from +18777804236 → webhook fired via ngrok → message stored (SM4f23ba2cfed794fd50be75ada8da7386) → callback attempted (404 expected — no callback server)
- Phase 2 regression: no new failures (2 pre-existing from phone number change during live testing)

#### Infrastructure
- Fixed ngrok v3 config file (duplicate `authtoken` key at root level)

### Decisions
- DEC-015: Webhook uses agentId from URL path + phone_number match for double validation

---

## Session 5 — 2026-02-14

### Phase 4 — Small Win: Make a Phone Call (Pre-recorded Voice Message)

#### New Files
- `src/providers/tts-mock.ts` — mock TTS adapter (returns silent WAV, used in demo mode and dry tests)
- `src/providers/tts-elevenlabs.ts` — ElevenLabs TTS adapter (text → audio via API, ulaw_8000 format for Twilio)
- `src/providers/storage-local.ts` — local filesystem storage adapter (saves to `storage/`, serves at `/storage/{key}`)
- `src/tools/send-voice-message.ts` — `comms_send_voice_message` MCP tool (TTS → upload → Twilio call → DB log)
- `tests/voice-message.test.ts` — dry test (26 assertions: tool listing, voice send, audio file verification, DB record, error cases)

#### Modified Files
- `src/providers/interfaces.ts` — added optional `twiml` field to `MakeCallParams`
- `src/providers/telephony-mock.ts` — implemented `makeCall()` (returns fake call SID)
- `src/providers/telephony-twilio.ts` — implemented `makeCall()` (POST to Calls.json with TwiML or webhook URL)
- `src/providers/factory.ts` — wired up TTS provider (demo → mock, ElevenLabs key → ElevenLabs, fallback → mock) and storage provider (always local)
- `src/index.ts` — added `/storage` static file serving route
- `src/server.ts` — registered `comms_send_voice_message` tool

#### Verification
- Build passes clean
- Dry test: 26/26 assertions pass (mock TTS + mock telephony)
- Live test pending (needs ngrok + real ElevenLabs + real Twilio call)

#### Live Verification (Virtual)
- Built Edge TTS adapter (`tts-edge.ts`) — free Microsoft TTS, no API key needed
- Installed `@andresaya/edge-tts` package
- Updated factory.ts — ElevenLabs if key present, Edge TTS as free fallback
- Edge TTS generates real MP3 audio (45-49KB per message)
- Audio stored locally and served via ngrok public URL (HTTP 200, size match confirmed)
- Twilio API called correctly — only blocked by trial account restriction (error 21219)
- Full pipeline verified: MCP tool → Edge TTS → local storage → public URL → Twilio API

### Decisions
- DEC-016: Inline TwiML with local audio storage (simplest approach for one-way voice messages)

---

## Session 6 — 2026-02-14

### Phase 5 — Live Voice AI Conversation

#### New Files
- `src/providers/voice-conversation-relay.ts` — ConversationRelay TwiML generator (builds `<Connect><ConversationRelay>` XML with ElevenLabs TTS + Deepgram STT)
- `src/providers/voice-mock.ts` — mock voice orchestrator for demo mode (returns simple `<Say>` TwiML)
- `src/webhooks/inbound-voice.ts` — webhook handlers for inbound (`POST /webhooks/:agentId/voice`) and outbound (`POST /webhooks/:agentId/outbound-voice`) voice calls
- `src/webhooks/voice-ws.ts` — WebSocket handler for live voice conversations (receives transcribed speech, streams LLM responses back via Anthropic Claude)
- `src/webhooks/voice-sessions.ts` — shared in-memory store for voice call configs and active conversations
- `src/tools/make-call.ts` — `comms_make_call` MCP tool (initiates outbound AI voice call)
- `tests/voice-call.test.ts` — dry test (25 assertions: tool registration, make call, DB record, WebSocket connectivity, setup/prompt/response cycle, error handling)

#### Modified Files
- `src/lib/config.ts` — added `anthropicApiKey`, `voiceDefaultGreeting`, `voiceDefaultSystemPrompt`, `voiceDefaultVoice`, `voiceDefaultLanguage`
- `src/providers/factory.ts` — wired up voice orchestrator (demo → mock, else → conversation-relay)
- `src/webhooks/router.ts` — registered voice webhook routes
- `src/index.ts` — wrapped Express with `http.createServer`, added `WebSocketServer` with upgrade routing for `/webhooks/:agentId/voice-ws`
- `src/server.ts` — registered `comms_make_call` tool
- `package.json` — added `ws`, `@types/ws`, `@anthropic-ai/sdk` dependencies

#### How It Works
- **Inbound call:** Human dials agent's number → Twilio hits voice webhook → returns ConversationRelay TwiML → Twilio opens WebSocket → human speaks → Twilio STT → prompt sent to our WebSocket → Claude LLM streams response → Twilio TTS → human hears AI
- **Outbound call:** `comms_make_call` → stores session config → Twilio makes call → outbound-voice webhook → same ConversationRelay flow
- **Interruption:** When human speaks while AI is talking, Twilio sends `interrupt` → abort controller cancels LLM generation
- **Demo mode:** No real LLM call — returns a fallback message

#### Verification
- Build passes clean
- Dry test: 25/25 assertions pass (mock telephony + mock voice orchestrator + no Anthropic key fallback)
- Live test pending (needs ngrok + real Twilio + real Anthropic API key)

---

## Session 7 — 2026-02-14

### Phase 6 — Email Channel (Resend)

#### New Files
- `src/providers/email-resend.ts` — Resend email adapter (send emails + verify domains via REST API, no SDK)
- `src/providers/email-mock.ts` — mock email adapter for demo/dev mode (fake messageId, mock DNS records)
- `src/webhooks/inbound-email.ts` — inbound email webhook handler (POST /webhooks/:agentId/email, Resend payload, store + forward)
- `tests/email.test.ts` — dry test (38 assertions: send email, DB record, inbound webhook, get_messages filter, error cases, SMS regression)

#### Modified Files
- `src/lib/config.ts` — added `resendApiKey` (reads `RESEND_API_KEY` from .env)
- `src/providers/factory.ts` — wires email provider (demo → mock, Resend key → Resend, fallback → mock with warning)
- `src/tools/send-message.ts` — extended `comms_send_message` with `channel` (sms/email), `subject`, and `html` params; routes to email or SMS provider; split into helper functions
- `src/webhooks/router.ts` — registered `POST /webhooks/:agentId/email` route

#### How It Works
- **Outbound email:** `comms_send_message(channel: "email", subject: "...", ...)` → looks up agent's `email_address` → calls Resend API (or mock) → stores in messages table with channel "email"
- **Inbound email:** Resend webhook POSTs to `/webhooks/:agentId/email` → validates agentId + email_address match → stores in messages table → forwards to callback URL
- **SMS unchanged:** Default channel remains "sms", existing behavior preserved

#### Verification
- Build passes clean
- Dry test: 38/38 assertions pass (demo mode with mock email adapter)
- SMS regression: confirmed working alongside new email channel

### Decisions
- DEC-017: Resend over SendGrid (SendGrid lost free tier May 2025, Resend has 3K/month free)
- DEC-018: Inbound email webhook uses same double-validation pattern as SMS (DEC-015)

---

## Session 8 — 2026-02-14

### Phase 7 — WhatsApp Channel (Twilio)

#### New Files
- `src/providers/whatsapp-twilio.ts` — Twilio WhatsApp adapter (send via same Messages API with `whatsapp:` prefix, template support via ContentSid/ContentVariables)
- `src/providers/whatsapp-mock.ts` — mock WhatsApp adapter for demo/dev mode
- `src/webhooks/inbound-whatsapp.ts` — inbound WhatsApp webhook handler (POST /webhooks/:agentId/whatsapp, strips `whatsapp:` prefix, store + forward)
- `tests/whatsapp.test.ts` — dry test (37 assertions: send WhatsApp, template params, inbound webhook, DB records, get_messages filter, error cases, SMS + email regression)

#### Modified Files
- `src/db/schema.sql` — added `whatsapp_pool` table (phone_number, sender_sid, status, assigned_to_agent)
- `src/providers/factory.ts` — wires WhatsApp provider (demo → mock, Twilio creds → Twilio, fallback → mock with warning)
- `src/tools/send-message.ts` — extended `comms_send_message` with `channel: "whatsapp"`, `templateId`, `templateVars` params; added `sendWhatsApp()` helper; added `whatsapp_sender_sid` to agent query
- `src/webhooks/router.ts` — registered `POST /webhooks/:agentId/whatsapp` route
- `src/db/seed.ts` — test agent now gets `whatsapp_sender_sid` (+1234567890)

#### How It Works
- **Outbound WhatsApp:** `comms_send_message(channel: "whatsapp", ...)` → looks up agent's `whatsapp_sender_sid` → calls Twilio Messages API with `From: whatsapp:+X`, `To: whatsapp:+Y` → stores in DB with channel "whatsapp"
- **Template messages:** Pass `templateId` (ContentSid) + `templateVars` for messages outside 24h window
- **Inbound WhatsApp:** Twilio webhook POSTs to `/webhooks/:agentId/whatsapp` → strips `whatsapp:` prefix from From/To → stores in DB → forwards to callback URL
- **SMS + email unchanged:** Existing channels work exactly as before

#### Verification
- Build passes clean
- Dry test: 37/37 assertions pass (demo mode with mock WhatsApp adapter)
- SMS + email regression: confirmed working alongside new WhatsApp channel

---

## Session 9 — 2026-02-15

### Phase 8 — Provisioning & Teardown

#### New Files
- `src/provisioning/phone-number.ts` — phone number lifecycle helpers (buy, configure webhooks, release)
- `src/provisioning/whatsapp-sender.ts` — WhatsApp pool management (assign from pool, return to pool, register sender)
- `src/provisioning/email-identity.ts` — email address generation + domain verification helper
- `src/tools/provision-channels.ts` — `comms_provision_channels` MCP tool (buy number, assign WhatsApp, generate email, insert agent, update pool — with rollback on failure)
- `src/tools/deprovision-channels.ts` — `comms_deprovision_channels` MCP tool (release number, return WhatsApp, mark deprovisioned, decrement pool)
- `src/tools/get-channel-status.ts` — `comms_get_channel_status` MCP tool (per-channel info, message counts, pool status)
- `src/tools/register-provider.ts` — `comms_register_provider` MCP tool (verify credentials, write to .env, support Twilio/Resend/ElevenLabs/Anthropic)
- `tests/provisioning.test.ts` — dry test (60 assertions: tool discovery, provision, duplicate check, status, send through agent, deprovision, double-deprovision, pool capacity, register provider, regression)

#### Modified Files
- `src/providers/telephony-mock.ts` — implemented `buyNumber()` (generates fake number), `releaseNumber()` (no-op), `configureWebhooks()` (no-op), `verifyWebhookSignature()` (returns true)
- `src/providers/telephony-twilio.ts` — implemented real `buyNumber()` (search + purchase via Twilio REST API) and `releaseNumber()` (lookup SID + DELETE)
- `src/server.ts` — registered 4 new tools
- `src/lib/config.ts` — added `emailDefaultDomain` field (env: `EMAIL_DEFAULT_DOMAIN`, default: `agents.example.com`)

#### How It Works
- **Provision:** `comms_provision_channels(agentId, displayName, capabilities)` → buy phone number → configure webhooks → insert agent row → assign WhatsApp from pool → generate email → update pool count. Rolls back on failure.
- **Deprovision:** `comms_deprovision_channels(agentId)` → release phone number → return WhatsApp → mark deprovisioned → decrement pool.
- **Status:** `comms_get_channel_status(agentId)` → returns per-channel details, message counts, pool info.
- **Register:** `comms_register_provider(provider, credentials)` → optional connectivity test → write to .env → return capabilities + restart note.

#### Bug Fix
- FK constraint: `whatsapp_pool.assigned_to_agent` references `agent_channels.agent_id`. Reordered provision flow to insert agent row before WhatsApp pool assignment (DEC-024).

#### Verification
- Build passes clean
- Dry test: 60/60 assertions pass (demo mode)
- SMS + email + WhatsApp regression: all pass

#### Decisions
- DEC-019 to DEC-024: Single-account provisioning, A2P deferred, WhatsApp soft fail, rollback on failure, no hot-reload, agent-first insert order

---

## Session 10 — 2026-02-15

### Phase 9 — Security & Auth

#### New Files (7)
- `src/db/schema-security.sql` — 3 new tables: `agent_tokens` (bearer token hashes), `provider_credentials` (encrypted creds), `spending_limits` (rate/spend caps)
- `src/security/token-manager.ts` — generate 32-byte tokens, SHA-256 hash for storage, verify/revoke via DB
- `src/security/auth-middleware.ts` — Express middleware on `POST /messages` validates bearer tokens, sets `req.auth` for MCP SDK
- `src/security/auth-guard.ts` — `requireAgent(agentId, authInfo)` and `requireAdmin(authInfo)` helpers for tool callbacks
- `src/security/sanitizer.ts` — input validation: catches XSS, SQL injection, CRLF, path traversal, command injection patterns
- `src/security/crypto.ts` — AES-256-GCM encrypt/decrypt for credential storage (unique random IV per record)
- `src/security/webhook-signature.ts` — Twilio HMAC-SHA1 + Resend/Svix HMAC-SHA256 signature verification middleware
- `tests/security.test.ts` — 49 assertions across unit tests (token manager, sanitizer, crypto, Twilio sig) and integration tests (regression, provisioning token flow, sanitizer live checks)

#### Modified Files (11)
- `src/db/migrate.ts` — also runs `schema-security.sql` during migration
- `src/index.ts` — auth middleware added to `POST /messages` handler
- `src/lib/config.ts` — added `resendWebhookSecret` field, added warning when `ORCHESTRATOR_SECURITY_TOKEN` missing
- `src/webhooks/router.ts` — Twilio signature middleware on SMS/WhatsApp/voice routes, Resend signature on email route
- `src/providers/telephony-twilio.ts` — implemented real `verifyWebhookSignature()` with HMAC-SHA1 + timing-safe comparison
- `src/tools/provision-channels.ts` — `requireAdmin` guard + generates security token on provision (returned once)
- `src/tools/deprovision-channels.ts` — `requireAdmin` guard + revokes all tokens on deprovision
- `src/tools/send-message.ts` — `requireAgent` guard + `sanitize()` on body and to fields
- `src/tools/get-messages.ts` — `requireAgent` guard
- `src/tools/send-voice-message.ts` — `requireAgent` guard + `sanitize()` on text and to
- `src/tools/make-call.ts` — `requireAgent` guard + `sanitize()` on to, systemPrompt, greeting
- `src/tools/get-channel-status.ts` — `requireAgent` guard
- `src/tools/register-provider.ts` — `requireAdmin` guard + encrypts credentials in DB if encryption key configured

#### How Auth Works
1. Admin sets `ORCHESTRATOR_SECURITY_TOKEN` in `.env`
2. Admin calls `comms_provision_channels` with orchestrator token → gets back a per-agent `securityToken`
3. Agent uses its token for all subsequent tool calls (`Authorization: Bearer <token>`)
4. Each tool checks: does this token belong to this agentId? (impersonation guard)
5. Webhooks check: is this really from Twilio/Resend? (signature validation)
6. Demo mode skips all auth (existing pattern)

#### Verification
- Build passes clean (zero TypeScript errors)
- Dry test: 49/49 assertions pass
- SMS + email + WhatsApp regression: all pass

#### Decisions
- DEC-025 to DEC-033: Bearer tokens (not JWT), orchestrator token from .env, Express middleware auth, demo mode bypass, sanitizer as utility function, per-route webhook signatures, AES-256-GCM credential encryption, SSE not authenticated, graceful degradation when no token configured
