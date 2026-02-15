<!-- version: 1.8 | updated: 2026-02-15 -->

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
│   │   └── logger.ts             # Structured JSON logger (no PII)
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
│   │   └── voice-mock.ts         # Mock voice orchestrator (demo mode — simple Say TwiML)
│   │
│   ├── db/                       # Database layer
│   │   ├── client.ts             # SQLite provider (implements IDBProvider)
│   │   ├── schema.sql            # Core tables (agent_channels, messages, agent_pool, whatsapp_pool)
│   │   ├── migrate.ts            # Migration runner
│   │   └── seed.ts               # Test agent seeder (npm run seed)
│   │
│   ├── webhooks/                 # Inbound webhook handlers
│   │   ├── router.ts             # Express router (/health, /health/ready, webhook routes)
│   │   ├── inbound-sms.ts        # POST /webhooks/:agentId/sms — Twilio inbound SMS handler
│   │   ├── inbound-email.ts      # POST /webhooks/:agentId/email — Resend inbound email handler
│   │   ├── inbound-whatsapp.ts   # POST /webhooks/:agentId/whatsapp — Twilio inbound WhatsApp handler
│   │   ├── inbound-voice.ts      # POST /webhooks/:agentId/voice + outbound-voice — ConversationRelay TwiML
│   │   ├── voice-ws.ts           # WebSocket handler for live voice (prompt → LLM → stream tokens)
│   │   └── voice-sessions.ts     # Shared in-memory store for voice call configs + conversations
│   │
│   ├── tools/                    # MCP tools
│   │   ├── send-message.ts       # comms_send_message (SMS + email + WhatsApp via provider routing)
│   │   ├── get-messages.ts       # comms_get_messages (list messages for an agent)
│   │   ├── send-voice-message.ts # comms_send_voice_message (TTS → call → play audio)
│   │   ├── make-call.ts          # comms_make_call (outbound AI voice call via ConversationRelay)
│   │   ├── provision-channels.ts # comms_provision_channels (buy number, assign WhatsApp, generate email)
│   │   ├── deprovision-channels.ts # comms_deprovision_channels (release number, return pool, deactivate)
│   │   ├── get-channel-status.ts # comms_get_channel_status (per-channel info, message counts, pool)
│   │   └── register-provider.ts  # comms_register_provider (verify + save credentials to .env)
│   ├── channels/                 # Channel implementations (empty — Phase 2+)
│   ├── security/                 # Auth, rate limiting (empty — Phase 9+)
│   ├── provisioning/             # Agent provisioning helpers
│   │   ├── phone-number.ts      # Buy, configure webhooks, release phone numbers
│   │   ├── whatsapp-sender.ts   # WhatsApp pool assign/return/register
│   │   └── email-identity.ts    # Email address generation + domain verification
│   ├── media/                    # TTS, media storage (empty — Phase 4+)
│   ├── billing/                  # Cost tracking (empty — Phase 10+)
│   ├── routing/                  # Route duplication (empty — Phase 13+)
│   ├── observability/            # Metrics, alerts (empty — Phase 11+)
│   └── admin/                    # Admin UI — setup wizard, credential management
│       ├── env-writer.ts         # Read/write .env file (atomic, preserves comments)
│       ├── credential-testers.ts # Test Twilio + ElevenLabs API credentials
│       ├── setup-page.ts         # HTML setup page (inline CSS/JS, card-based UI)
│       └── router.ts             # Express routes: /admin/setup, /admin/api/*
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
│   └── provisioning.test.ts     # Dry test for provisioning/teardown (60 assertions)
│
└── docs/
    ├── SPEC.md                   # Project specification (source of truth)
    ├── TODO.md                   # Task list by phase
    ├── DECISIONS.md              # Architecture decision log
    ├── CHANGELOG.md              # Session-by-session changes
    ├── STRUCTURE.md              # This file
    ├── MENU.md                   # Developer menu actions
    └── references/               # External reference documents
        ├── PROJECT-SCOPE.md
        ├── ai-voice-agent-architecture.md
        ├── twilio-mcp-serverless-deploy.md
        └── dynamic-comms-architecture.md
```
