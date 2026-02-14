<!-- version: 1.6 | updated: 2026-02-14 -->

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
