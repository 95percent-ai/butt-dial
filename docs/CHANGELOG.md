<!-- version: 1.4 | updated: 2026-02-14 -->

# Changelog

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
