<!-- version: 4.0 | updated: 2026-02-16 -->

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
