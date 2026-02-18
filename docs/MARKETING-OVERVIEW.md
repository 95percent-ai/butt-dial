# Agent Communication Server

**Give any AI agent a phone, a voice, and every messaging channel — in one API call.**

---

## The Problem

AI agents today can think, reason, and plan. But they can't pick up the phone. They can't send a text, respond to a WhatsApp, or email a customer back. The moment an AI needs to communicate with the real world — through the channels humans actually use — it hits a wall.

Building communication into AI agents is hard:

- **Fragmented infrastructure.** SMS needs Twilio. Email needs SendGrid. WhatsApp needs Meta approval. Voice needs WebSocket streaming, speech-to-text, text-to-speech, and real-time LLM orchestration. Each channel is its own integration project.
- **No standard protocol.** Every AI platform wires communication differently. There's no plug-and-play layer that says: "Here are your tools — send a message, make a call, answer the phone."
- **Compliance minefields.** TCPA, GDPR, CAN-SPAM, DNC lists, recording consent, content filtering — one mistake is a lawsuit. Most teams skip compliance entirely or bolt it on late.
- **Cost blindness.** AI agents that can spend money on API calls without rate limits, spending caps, or usage tracking are a financial risk.

The result: most AI agents operate in a text-in, text-out bubble. They can't call a lead, confirm an appointment, handle a support ticket over WhatsApp, or leave a voicemail. The last mile of AI utility — real-world communication — is still manual.

---

## The Solution

A single server that gives any AI agent full communication abilities across **5 channels**: phone calls, SMS, email, realtime messeaging. The agent connects once and gets access to 16 tools that cover the entire communication lifecycle — from sending a text to having a live voice conversation.

Built on the **Model Context Protocol (MCP)** — the open standard by Anthropic for connecting AI agents to external tools. Any MCP-compatible client (Claude Desktop, Cursor, custom orchestrators, or any LLM framework) can connect and start communicating immediately.

**This is infrastructure, not a chatbot.** The server doesn't think, doesn't store private context, doesn't generate responses. It executes communication actions and routes inbound messages back to whatever AI brain is connected. The agent decides what to say. The server makes it heard.

---

## What It Does

### Outbound Communication
An AI agent can:
- **Send SMS** to any phone number worldwide
- **Send email** with subject lines, HTML bodies, and attachments
- **Send WhatsApp,Telegram, Line messages** including template messages for the 24-hour window
- **Make live AI voice calls** — the agent calls a human, and when they pick up, a real-time voice conversation begins with the AI
- **Send pre-recorded voice messages** — text is converted to speech, then delivered as a phone call

### Inbound Communication
When a human contacts an agent:
- **Inbound calls** connect to the AI for live voice conversation
- **Inbound SMS, WhatsApp, email, and LINE** are routed to the correct agent
- **Smart answering machine** — when the AI agent isn't connected, a built-in assistant takes the call, collects the message and caller preferences ("call me back after 8am"), and delivers everything when the agent reconnects

### Voice AI
The voice system is the technical centerpiece:
- Human speaks into their phone
- Speech is transcribed to text in real-time (Deepgram)
- Text is routed to the connected AI agent via MCP
- Agent responds with text
- Text is converted to natural speech (ElevenLabs, OpenAI, or Edge TTS)
- Human hears the AI response — sub-second latency

The server handles all the audio infrastructure. The AI agent only sees text in, text out. It doesn't need to know anything about telephony, codecs, or WebSockets.

### Smart Number Routing
A shared pool of phone numbers with automatic country-based routing. When calling an Israeli number, the system picks the Israeli number from the pool. When calling a US number, it picks the US number. Same-country routing = lowest cost path. Fully automatic, no agent configuration needed.

---

## 16 MCP Tools

Every capability is exposed as a standard MCP tool that any connected AI agent can call:

| Tool | What it does |
|------|-------------|
| `comms_send_message` | Send SMS, email, WhatsApp, or LINE |
| `comms_make_call` | Start a live AI voice call |
| `comms_send_voice_message` | Deliver a TTS voice message via phone |
| `comms_get_messages` | Retrieve conversation history |
| `comms_transfer_call` | Transfer a live call to a human or another agent |
| `comms_provision_channels` | Set up all channels for a new agent |
| `comms_deprovision_channels` | Tear down an agent's channels |
| `comms_get_channel_status` | Check channel health and status |
| `comms_onboard_customer` | One-call automated onboarding (provision + DNS + credentials + instructions) |
| `comms_register_provider` | Register third-party provider credentials |
| `comms_set_agent_limits` | Configure rate limits and spending caps |
| `comms_get_usage_dashboard` | Usage statistics and cost breakdown |
| `comms_get_billing_summary` | Provider cost vs. billed cost with markup |
| `comms_set_billing_config` | Set billing tier, markup percentage, billing email |
| `comms_expand_agent_pool` | Resize the agent pool |
| `comms_create_organization` | Create a tenant organization (super-admin) |

---

## Why It Matters — The Market Case

### AI Agents Are the Next Platform

The AI agent market is moving from chatbots to autonomous agents that take actions in the real world. Communication is the most fundamental action. An agent that can't call, text, or email is like a smartphone without a cellular radio — technically smart, practically limited.

### Every AI Platform Needs This

Whether it's a customer service platform, a sales automation tool, an appointment scheduling system, a personal AI assistant, even a system to a third party system to a human — the moment it needs to reach a human through a real channel, it needs this infrastructure. Today, every platform builds its own integration from scratch. That's like every website building its own HTTP server.

### MCP Is the Standard

The Model Context Protocol is becoming the standard way AI agents connect to tools. Building on MCP means this server works with any agent framework, any LLM provider, any orchestrator. One integration, universal compatibility.

### The Compliance Gap Is Real

Most AI communication solutions ignore compliance. TCPA violations carry fines of $500-$1,500 per call. GDPR fines reach 4% of global revenue. CAN-SPAM penalties are $50,120 per email. This server ships with compliance built in — not as an afterthought, but as a core layer that's enforced on every outbound action.

---

## Architecture — Built for Scale

### Pluggable Provider System

Every external dependency uses an abstract interface. Providers are swappable via configuration, not code changes:

| Capability | Options |
|-----------|---------|
| Telephony | Twilio, Vonage (built), Plivo, Telnyx (interface ready) |
| Email | Resend (built), SendGrid, Postmark, AWS SES (interface ready) |
| WhatsApp | Twilio (built), GreenAPI (built) |
| Voice (TTS) | ElevenLabs (built), OpenAI (built), Edge TTS (built, free) |
| Voice (STT) | Deepgram (built) |
| Database | SQLite (built), Turso (built), Convex (built), Postgres/Neon (interface ready) |
| Storage | Local filesystem (built), AWS S3 (built), Cloudflare R2 (built) |

Switching from Twilio to Vonage is a config change. Moving from SQLite to Postgres is a config change. The business logic never touches vendor-specific code.

### Multi-Tenant from the Ground Up

- **Organization isolation** — every data row is scoped to an org_id. No cross-tenant data access.
- **3-tier authentication** — super-admin (platform operator), org-admin (customer), agent (end user). Each tier sees only what it should.
- **Per-agent billing** — every action's cost is tracked and attributed. Configurable markup creates a revenue stream for platform operators.

### Security That Ships, Not Bolts On

- Bearer token auth on every tool call (SHA-256 hashed, instantly revocable)
- AES-256-GCM encryption for stored credentials
- Webhook signature validation (Twilio HMAC-SHA1, Resend/Svix HMAC-SHA256)
- Input sanitization (SQL injection, XSS, CRLF, path traversal, command injection)
- HTTP rate limiting (per-IP + global), brute-force lockout (10 failures = 15-minute ban)
- Anomaly detection (volume spikes, rapid token rotation, brute force patterns)
- Tamper-evident audit log (SHA-256 hash chain)
- CORS, CSP, and all standard security headers

### Real-Time Translation

Each agent has its own operating language. When communicating with someone who speaks a different language, translation happens automatically:
- Outbound messages translated before sending
- Inbound messages translated to the agent's language
- Voice calls translated in real-time (both directions)
- Original messages preserved for audit

---

## Deployment Models

The server is designed for three deployment scenarios:

### 1. Standalone Product
Any team building AI agents connects to this server for communication. Works with Claude, GPT, Llama, Gemini — any LLM behind any MCP client.

### 2. Platform Infrastructure
AI platforms embed this as their communication layer. Multi-tenant isolation means each customer gets their own org with independent billing, rate limits, and data.

### 3. Part of AgentOS
Layer 3 ("Hands") in the AgentOS stack by 95percent.ai. The brain thinks (Layer 1), the eyes see data (Layer 2), the hands communicate (Layer 3), the legs take business actions (Layer 4).

---

## What's Built and Working

This is not a pitch deck. The system is implemented, tested, and running.

- **22 development phases completed**
- **700+ test assertions passing** across 24 test suites
- **16 MCP tools** fully functional
- **5 channels** operational (SMS, email, WhatsApp, voice, LINE)
- **10 provider adapters** built (Twilio, Vonage, Resend, ElevenLabs, OpenAI TTS, Edge TTS, Deepgram, S3, R2, Turso)
- **Live voice calls verified** — real conversations between humans and AI agents over the phone
- **Admin dashboard, Swagger API docs, and setup wizard** all functional
- **Demo mode** — full system runs with mock providers for risk-free evaluation

### Test Coverage by Area

| Area | Assertions |
|------|-----------|
| SMS send/receive | 41 |
| Email send/receive | 38 |
| WhatsApp send/receive | 37 |
| Voice calls + WebSocket | 51 |
| Provisioning lifecycle | 60 |
| Security & auth | 49 |
| Rate limiting & costs | 27 |
| Observability & alerts | 26 |
| Compliance (TCPA, GDPR, DNC) | 27 |
| Billing & markup | 36 |
| Multi-tenant isolation | 50 |
| Translation | 33 |
| Provider adapters | 42 |
| Admin UI & API | 41 |
| End-to-end integration | 49 |
| Documentation completeness | 52 |
| Number pool routing | 21 |

---

## Revenue Model for Platform Operators

The billing system is built for operators who deploy this server for their customers:

1. **Per-action cost tracking** — every SMS, call, email has its real provider cost recorded
2. **Configurable markup** — platform operator sets a markup percentage (e.g., 30%) on top of provider costs
3. **4-tier system** — Free, Starter, Pro, Enterprise with configurable rate limits and spending caps per tier
4. **Spending alerts** — automatic alerts at 80% of daily/monthly caps
5. **Usage dashboards** — per-agent and per-org cost visibility

Example: Provider charges $0.0075 per SMS. Operator sets 40% markup. Customer is billed $0.0105. The $0.003 delta is margin.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+, TypeScript (strict mode) |
| Protocol | MCP (Model Context Protocol) via HTTP/SSE |
| Web framework | Express 5 |
| Database | SQLite (dev), Postgres-compatible (production) |
| Dependencies | 7 runtime packages total |

The entire server has **7 runtime dependencies**. No framework bloat. No unnecessary abstractions. Zero-dependency security middleware (no helmet, no cors package). Every feature is built from first principles.

---

## Summary

**One server. Five channels. Any AI agent. Full compliance. Production-ready.**

The communication layer for AI agents doesn't exist as a product today. Every platform builds it from scratch — Twilio integration, webhook handling, voice WebSocket streaming, compliance checks, billing tracking — burning months of engineering on infrastructure that isn't their core product.

This server is that missing layer. Connect your AI agent, and it can immediately call, text, email, and message anyone in the world — through the standard MCP protocol, with built-in security, compliance, billing, and multi-tenant isolation.

The question isn't whether AI agents need communication abilities. The question is whether every team should build their own, or use the infrastructure that's already built, tested, and working.

---

*Built by 95percent.ai*
