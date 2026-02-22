<!-- version: 3.8 | updated: 2026-02-22 -->

# Project Structure

```
agentos-comms-mcp/
├── .env                          # Local environment config (not committed)
├── .env.example                  # Template with all config options
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript config
│
├── src/
│   ├── index.ts                  # Entry point — starts MCP + Express server
│   ├── server.ts                 # MCP server setup, tool registration
│   │
│   ├── lib/                      # Shared utilities
│   │   ├── config.ts             # .env loader with zod validation
│   │   ├── types.ts              # Shared TypeScript types
│   │   ├── logger.ts             # Structured JSON logger (no PII)
│   │   ├── agent-registry.ts     # Maps agentId → MCP server session (for voice routing)
│   │   ├── message-dispatcher.ts # Dispatches pending dead letters when agent reconnects via SSE
│   │   ├── channel-blocker.ts   # Per-channel kill switch: parseBlockedChannels, isChannelBlocked, buildBlockedChannels
│   │   ├── billing.ts            # Billing module: markup, tiers, spending alerts
│   │   ├── audio-converter.ts    # PCM ↔ mu-law 8kHz converter + WAV headers
│   │   ├── llm-adapter.ts         # Plug-and-play LLM interface (Anthropic, OpenAI, custom endpoint)
│   │   ├── org-manager.ts        # Organization CRUD + token management (multi-tenant)
│   │   ├── sandbox-responder.ts  # Fire-and-forget LLM-powered reply simulation for sandbox mode
│   │   ├── translator.ts         # Language detection + translation via Anthropic API (Claude Haiku)
│   │   ├── number-pool.ts       # Smart number routing: country detection + pool selection for outbound calls/SMS
│   │   ├── country-compliance.ts # Per-country regulatory rules engine (37 countries: TCPA, GDPR, CASL, etc.)
│   │   └── data-retention.ts   # Configurable auto-purge for dead letters, logs, OTP, consent
│   │
│   ├── providers/                # Pluggable provider adapters
│   │   ├── interfaces.ts         # All 8 provider interfaces
│   │   ├── factory.ts            # Config → adapter resolution
│   │   ├── telephony-mock.ts     # Mock telephony (demo mode / dev)
│   │   ├── telephony-twilio.ts   # Twilio telephony (sendSms, makeCall via REST API)
│   │   ├── tts-mock.ts           # Mock TTS (returns silent WAV for demo/dev)
│   │   ├── tts-elevenlabs.ts     # ElevenLabs TTS (text → audio via API)
│   │   ├── tts-edge.ts           # Edge TTS (free Microsoft TTS, no API key)
│   │   ├── storage-local.ts      # Local filesystem storage (serves via /storage route)
│   │   ├── email-resend.ts        # Resend email adapter (send + verifyDomain via REST API)
│   │   ├── email-mock.ts         # Mock email adapter (demo/dev mode)
│   │   ├── whatsapp-twilio.ts    # Twilio WhatsApp adapter (send via Messages API with whatsapp: prefix)
│   │   ├── whatsapp-mock.ts      # Mock WhatsApp adapter (demo/dev mode)
│   │   ├── voice-conversation-relay.ts # ConversationRelay TwiML generator (live voice)
│   │   ├── voice-mock.ts         # Mock voice orchestrator (demo mode — simple Say TwiML)
│   │   ├── telephony-vonage.ts   # Vonage telephony adapter (SMS, calls, transfers, numbers)
│   │   ├── stt-mock.ts           # Mock STT adapter (returns fixed transcription)
│   │   ├── stt-deepgram.ts       # Deepgram STT adapter
│   │   ├── tts-openai.ts         # OpenAI TTS adapter
│   │   ├── db-turso.ts           # Turso/libSQL database adapter
│   │   ├── db-convex.ts          # Convex database adapter
│   │   ├── storage-s3.ts         # S3 storage adapter (AWS Signature V4)
│   │   └── storage-r2.ts         # R2 storage adapter (wraps S3)
│   │
│   ├── db/                       # Database layer
│   │   ├── client.ts             # SQLite provider (implements IDBProvider)
│   │   ├── schema.sql            # Core tables (agent_channels, agent_pool, whatsapp_pool)
│   │   ├── schema-security.sql   # Security tables (agent_tokens, provider_credentials, spending_limits)
│   │   ├── schema-rate-limiting.sql # Rate limiting table (usage_logs with indexes)
│   │   ├── schema-observability.sql # Audit log table with hash chain
│   │   ├── schema-dead-letters.sql # Dead letters table (failed/undeliverable messages across all channels)
│   │   ├── schema-call-logs.sql # Call logs table (duration, cost, recording, transfer)
│   │   ├── schema-compliance.sql # DNC list + GDPR erasure requests tables
│   │   ├── schema-billing.sql   # Billing config table
│   │   ├── schema-org.sql       # Organization + org_tokens tables (multi-tenant)
│   │   ├── schema-otp.sql       # OTP verification codes table
│   │   ├── schema-number-pool.sql # Number pool table (shared phone numbers for smart routing)
│   │   ├── schema-consent.sql   # Consent tracking + country terms accepted tables
│   │   ├── migrate.ts            # Migration runner (runs all schema files + org_id migration)
│   │   └── seed.ts               # Test agent seeder + number pool seeder (npm run seed)
│   │
│   ├── webhooks/                 # Inbound webhook handlers
│   │   ├── router.ts             # Express router (/health, /health/ready, webhook routes)
│   │   ├── inbound-sms.ts        # POST /webhooks/:agentId/sms — Twilio inbound SMS handler
│   │   ├── inbound-email.ts      # POST /webhooks/:agentId/email — Resend inbound email handler
│   │   ├── inbound-whatsapp.ts   # POST /webhooks/:agentId/whatsapp — Twilio inbound WhatsApp handler
│   │   ├── inbound-line.ts       # POST /webhooks/:agentId/line — LINE inbound message handler
│   │   ├── inbound-voice.ts      # POST /webhooks/:agentId/voice + outbound-voice — ConversationRelay TwiML
│   │   ├── voice-ws.ts           # WebSocket handler for live voice (agent sampling → answering machine → fallback)
│   │   └── voice-sessions.ts     # Shared in-memory store for voice call configs + conversations (mode: agent/answering-machine)
│   │
│   ├── tools/                    # MCP tools
│   │   ├── send-message.ts       # comms_send_message (SMS + email + WhatsApp via provider routing)
│   │   ├── waiting-messages.ts   # comms_get_waiting_messages (fetch dead letters — fetch = acknowledge)
│   │   ├── send-voice-message.ts # comms_send_voice_message (TTS → call → play audio)
│   │   ├── make-call.ts          # comms_make_call (outbound AI voice call via ConversationRelay)
│   │   ├── provision-channels.ts # comms_provision_channels (buy number, assign WhatsApp, generate email)
│   │   ├── deprovision-channels.ts # comms_deprovision_channels (release number, return pool, deactivate)
│   │   ├── get-channel-status.ts # comms_get_channel_status (per-channel info, message counts, pool)
│   │   ├── register-provider.ts  # comms_register_provider (verify + save credentials to .env)
│   │   ├── set-agent-limits.ts   # comms_set_agent_limits (admin-only: set rate/spending caps)
│   │   ├── get-usage-dashboard.ts # comms_get_usage_dashboard (usage stats, costs, limits)
│   │   ├── onboard-customer.ts  # comms_onboard_customer (unified onboarding: provision + DNS + instructions)
│   │   ├── transfer-call.ts     # comms_transfer_call (transfer live call to human/agent)
│   │   ├── get-billing-summary.ts # comms_get_billing_summary + comms_set_billing_config
│   │   ├── expand-agent-pool.ts # comms_expand_agent_pool (resize pool)
│   │   ├── otp-tools.ts         # OTP verification tools (send, verify)
│   │   ├── org-tools.ts         # comms_create_organization + comms_list_organizations (super-admin)
│   │   └── consent-tools.ts    # comms_record/revoke/check_consent + hasActiveConsent + revokeConsentByAddress
│   ├── channels/                 # Channel implementations (empty — Phase 2+)
│   ├── security/                 # Auth, rate limiting, input validation
│   │   ├── token-manager.ts      # Bearer token generate/store/verify/revoke (SHA-256 hashed)
│   │   ├── auth-middleware.ts    # Express middleware on POST /messages (validates bearer tokens)
│   │   ├── auth-guard.ts        # 3-tier auth guards: requireAgent/Admin/OrgAdmin/SuperAdmin + getOrgId/isSuperAdmin
│   │   ├── org-scope.ts         # Org-scoped query helpers: orgFilter, orgWhere, requireAgentInOrg
│   │   ├── sanitizer.ts         # Input validation (XSS, SQLi, CRLF, path traversal, command injection)
│   │   ├── crypto.ts            # AES-256-GCM encrypt/decrypt for credential storage
│   │   ├── webhook-signature.ts # Twilio HMAC-SHA1 + Resend/Svix signature verification + replay nonce cache
│   │   ├── rate-limiter.ts     # Rate limiting: check limits, log usage, spending caps, contact frequency
│   │   ├── security-headers.ts # X-Frame-Options, CSP, nosniff, XSS-Protection, Referrer-Policy, HSTS
│   │   ├── cors.ts             # CORS middleware (configurable allowed origins, OPTIONS preflight)
│   │   ├── http-rate-limiter.ts # HTTP-level per-IP + global rate limiting (in-memory)
│   │   ├── ip-filter.ts        # IP allowlist/denylist middleware factory (admin + webhook scopes)
│   │   ├── anomaly-detector.ts # Volume spike, brute force, rapid token rotation detection
│   │   ├── session.ts         # Session cookie module: AES-256-CBC encrypt/decrypt/set/clear for admin auth (DEC-066)
│   │   └── compliance.ts      # Content filter, DNC, TCPA, CAN-SPAM, GDPR erasure
│   ├── provisioning/             # Agent provisioning helpers
│   │   ├── phone-number.ts      # Buy, configure webhooks, release phone numbers
│   │   ├── whatsapp-sender.ts   # WhatsApp pool assign/return/register
│   │   └── email-identity.ts    # Email address generation + domain verification
│   ├── media/                    # TTS, media storage (empty — Phase 4+)
│   ├── billing/                  # Cost tracking (empty — Phase 10+)
│   ├── routing/                  # Route duplication (empty — Phase 13+)
│   ├── observability/            # Metrics, audit log, alerts
│   │   ├── metrics.ts           # Prometheus-compatible counters/gauges + text format
│   │   ├── audit-log.ts         # SHA-256 hash-chained immutable audit trail
│   │   ├── alert-manager.ts     # Severity-routed alert dispatcher (CRITICAL→WhatsApp, etc.)
│   │   └── whatsapp-alerter.ts  # Sends formatted alerts to admin WhatsApp number
│   ├── public/                    # Public-facing pages
│   │   ├── landing-page.ts       # Landing page HTML (hero, features, registration)
│   │   ├── auth-page.ts          # Auth page HTML (login, register with KYC, verify — auto-redirects to /admin)
│   │   ├── auth-api.ts           # Registration/login/logout API endpoints (sets session cookies on login/verify)
│   │   ├── docs.ts               # Documentation pages (/docs/*: home, getting-started, integration, channel-setup, etc.)
│   │   └── legal-pages.ts       # Terms of Service, AUP, Privacy Policy HTML pages
│   │
│   └── admin/                    # Admin UI — setup wizard, credential management
│       ├── env-writer.ts         # Read/write .env file (atomic, preserves comments)
│       ├── credential-testers.ts # Test Twilio + ElevenLabs + Resend API credentials
│       ├── setup-page.ts         # HTML setup page (5 cards: Twilio, ElevenLabs, Resend, Server, Voice)
│       ├── dashboard-page.ts    # Admin dashboard HTML page (agents, usage, alerts)
│       ├── swagger-page.ts      # Swagger UI HTML page (CDN-based, dark theme)
│       ├── openapi-spec.ts      # OpenAPI 3.1 spec generator
│       ├── scenario-runner.ts   # 8 demo scenarios for testing
│       ├── unified-admin.ts      # Unified admin SPA (dashboard, settings, agents, API docs, simulator)
│       ├── simulator-page.ts    # Simulator tab HTML (chat agent, guided walkthrough)
│       ├── simulator-api.ts     # Simulator API handlers (tools, execute, chat)
│       └── router.ts             # Express routes: /admin, /admin/api/*, redirects from old pages
│
├── storage/                      # Audio files served at /storage (auto-created)
├── data/                         # SQLite database file (auto-created)
├── scripts/                      # Setup and utility scripts (empty — Phase 0)
├── tests/                        # Test suites
│   ├── send-message.test.ts      # Dry test for comms_send_message (21 assertions)
│   ├── live-sms.test.ts          # Live test for outbound SMS (Phase 2)
│   ├── inbound-sms.test.ts       # Dry test for inbound SMS webhook + get_messages (20 assertions)
│   ├── live-inbound-sms.test.ts  # Live test for inbound SMS via Twilio webhook
│   ├── voice-message.test.ts     # Dry test for comms_send_voice_message (26 assertions)
│   ├── live-voice.test.ts        # Live test for voice message (real TTS + real Twilio)
│   ├── voice-call.test.ts        # Dry test for comms_make_call + voice WebSocket (25 assertions)
│   ├── email.test.ts             # Dry test for email send/receive (38 assertions)
│   ├── whatsapp.test.ts          # Dry test for WhatsApp send/receive/templates (37 assertions)
│   ├── provisioning.test.ts     # Dry test for provisioning/teardown (60 assertions)
│   ├── security.test.ts         # Dry test for security & auth (49 assertions)
│   ├── rate-limiting.test.ts   # Dry test for rate limiting & cost tracking (27 assertions)
│   ├── observability.test.ts  # Dry test for observability & alerts (26 assertions)
│   ├── setup-ui.test.ts      # Dry test for expanded setup UI & admin API (24 assertions)
│   ├── onboarding.test.ts    # Dry test for config architecture & customer onboarding
│   ├── attack-hardening.test.ts # Dry test for attack hardening (security headers, CORS, rate limit, IP filter, replay)
│   ├── advanced-voice.test.ts # Dry test for advanced voice (transfer, call logs, STT, audio) — 26 assertions
│   ├── provider-adapters.test.ts # Dry test for provider adapters (Vonage, S3, R2, Turso, Convex) — 42 assertions
│   ├── swagger.test.ts        # Dry test for Swagger UI + OpenAPI spec — 29 assertions
│   ├── dashboard.test.ts      # Dry test for admin dashboard — 48 assertions
│   ├── channel-blocking.test.ts # Dry test for channel blocking — 41 assertions
│   ├── compliance.test.ts     # Dry test for compliance (content filter, DNC, TCPA, GDPR) — 27 assertions
│   ├── billing.test.ts        # Dry test for billing & markup — 36 assertions
│   ├── documentation.test.ts  # Dry test for documentation completeness — 52 assertions
│   ├── end-to-end.test.ts     # Comprehensive end-to-end test — 49 assertions
│   ├── multi-tenant.test.ts   # Multi-tenant organization isolation test — 50 assertions
│   ├── translation.test.ts   # Translation feature test — 33 assertions
│   ├── number-pool.test.ts  # Number pool + smart routing test — 21 assertions
│   ├── regulatory-compliance.test.ts # Regulatory compliance & distribution model — 84 assertions
│   ├── onboarding-flow.test.ts          # Third-party MCP onboarding — 44 assertions
│   ├── session-auth.test.ts             # Session-based admin auth — 33 assertions (8 skipped in demo mode)
│   └── third-party-integration.test.ts  # Third-party integration — 40 assertions (registration, token, sandbox, docs)
│
└── docs/
    ├── SPEC.md                   # Project specification (source of truth)
    ├── TODO.md                   # Task list by phase
    ├── DECISIONS.md              # Architecture decision log
    ├── CHANGELOG.md              # Session-by-session changes
    ├── STRUCTURE.md              # This file
    ├── MENU.md                   # Developer menu actions
    ├── ONBOARDING.md             # User-facing setup & agent connection guide
    ├── SETUP.md                  # Full setup guide
    ├── API.md                    # REST API reference
    ├── MCP-TOOLS.md              # MCP tool reference with examples
    ├── PROVIDERS.md              # Provider adapter guide
    ├── SECURITY.md               # Security model and hardening
    ├── OBSERVABILITY.md          # Monitoring and alerts guide
    ├── ARCHITECTURE.md           # System architecture
    ├── TROUBLESHOOTING.md        # Common issues and fixes
    ├── CHANNEL-SETUP.md          # Channel setup guide — SMS, Voice, Email, WhatsApp, LINE (inbound/outbound/two-way)
    ├── INTEGRATION.md            # Orchestrator integration guide — register, get token, sandbox, REST API, MCP, go live
    ├── MARKETING-OVERVIEW.md     # Investor/evangelist overview — capabilities, market case, architecture
    └── references/               # External reference documents
        ├── PROJECT-SCOPE.md
        ├── ARCHITECTURE-OVERVIEW.md
        ├── ai-voice-agent-architecture.md
        ├── twilio-mcp-serverless-deploy.md
        └── dynamic-comms-architecture.md
```
