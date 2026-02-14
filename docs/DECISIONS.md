<!-- version: 2.4 | updated: 2026-02-14 -->

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

## Architectural Theme

All 7 decisions follow a pattern: **make it configurable, with sensible defaults.** The MCP server is a standalone product that different systems connect to. It can't assume one deployment model. The connected system (AgentOS, third-party platform, etc.) configures identity, isolation, billing, media, and other behaviors at setup time.
