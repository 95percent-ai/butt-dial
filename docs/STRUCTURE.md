<!-- version: 1.3 | updated: 2026-02-14 -->

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
│   │   └── telephony-twilio.ts   # Twilio telephony (sendSms via REST API)
│   │
│   ├── db/                       # Database layer
│   │   ├── client.ts             # SQLite provider (implements IDBProvider)
│   │   ├── schema.sql            # Core tables (agent_channels, messages, agent_pool)
│   │   ├── migrate.ts            # Migration runner
│   │   └── seed.ts               # Test agent seeder (npm run seed)
│   │
│   ├── webhooks/                 # Inbound webhook handlers
│   │   ├── router.ts             # Express router (/health, /health/ready, webhook routes)
│   │   └── inbound-sms.ts        # POST /webhooks/:agentId/sms — Twilio inbound SMS handler
│   │
│   ├── tools/                    # MCP tools
│   │   ├── send-message.ts       # comms_send_message (SMS via telephony provider)
│   │   └── get-messages.ts       # comms_get_messages (list messages for an agent)
│   ├── channels/                 # Channel implementations (empty — Phase 2+)
│   ├── security/                 # Auth, rate limiting (empty — Phase 9+)
│   ├── provisioning/             # Agent provisioning (empty — Phase 8)
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
├── data/                         # SQLite database file (auto-created)
├── scripts/                      # Setup and utility scripts (empty — Phase 0)
├── tests/                        # Test suites
│   ├── send-message.test.ts      # Dry test for comms_send_message (21 assertions)
│   ├── live-sms.test.ts          # Live test for outbound SMS (Phase 2)
│   ├── inbound-sms.test.ts       # Dry test for inbound SMS webhook + get_messages (20 assertions)
│   └── live-inbound-sms.test.ts  # Live test for inbound SMS via Twilio webhook
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
