# Architecture Overview

A plain-language explanation of how the VOS Twilio MCP system works.

---

## Who calls the MCP server?

A third-party system (like Claude Desktop, Cursor, or any MCP-compatible AI orchestrator) connects via SSE at `/sse`. That system sends tool calls to manage agents and their communications.

## What communication channels exist?

There are **5 capabilities**:

| Channel | What it does |
|---------|-------------|
| **SMS** | Send/receive text messages via a phone number |
| **Phone calls (voice AI)** | Live 2-way AI voice conversation — human talks, the connected AI agent responds in real-time |
| **Voice messages** | One-way TTS audio delivered as a phone call or WhatsApp voice note |
| **Email** | Send/receive emails with text, HTML, and file attachments via a generated address (`agentId@your-domain.com`) |
| **WhatsApp** | Send/receive text, voice messages, images, and files via a pool of pre-registered numbers |

Phone, SMS, email, WhatsApp are the **channels**. Voice AI and voice messages are two **modes** of the phone channel. Voice messages can also be delivered via WhatsApp as audio notes. Email and WhatsApp both support file attachments.

## How does an agent get set up?

An admin calls `comms_provision_channels` with a list of what the agent needs. The system then:

- **Phone/SMS**: Buys a real phone number from Twilio via API, configures webhooks automatically
- **Email**: Generates an address like `agent-123@agents.example.com` (domain must be pre-verified with Resend)
- **WhatsApp**: Assigns a number from a pre-provisioned pool (WhatsApp requires Meta verification, so numbers are set up in advance)
- **Voice AI**: Uses the same phone number — adds a system prompt and greeting for the AI personality

All of this happens on the fly in one API call. The agent gets back a security token it uses for all future communication.

## TTS / STT / Voice

- **TTS (text-to-speech)**: ElevenLabs (paid, high quality) or Edge TTS (free, built-in). Used for voice messages.
- **STT (speech-to-text)**: Handled by Twilio's ConversationRelay — the server never touches audio directly for live calls. It only deals with text in/out.
- **Voice personality**: The agent's voice is configured via a voice ID (ElevenLabs voice) set during provisioning.

For live calls, the flow is:

> Human speaks → Twilio transcribes → sends text to MCP server → server routes text back to the connected AI agent (via MCP) → agent responds → server sends response to Twilio → Twilio speaks it with TTS

The server only handles the text layer. It never calls an LLM itself — the connected AI agent provides responses because it has the context (personality, history, business logic). The server doesn't know or care which LLM the agent uses.

### Fallback: smart answering machine

When the AI agent is **not connected or not responding**, the server uses a built-in LLM (Claude) as an automated answering machine:

1. Apologizes to the caller
2. Collects their message and preferences (e.g. "call me back after 8am")
3. Stores everything with full context — who called, when, what channel, what was said

When the agent reconnects, the server dispatches all collected messages so the agent can decide what to do. Example:

> *"Inon tried to call you at 14:00 via phone. You didn't answer, so we initiated contact, apologized, and he left this message for you. He prefers you answer tomorrow morning after 8:00."*

## How are providers configured?

**Both ways — admin UI and API:**

1. **Admin UI** at `/admin/setup` — a web page where the admin enters API keys (Twilio, ElevenLabs, Resend), tests each connection with a button, saves to `.env`, and clicks Deploy to restart the server.

2. **MCP tool** `comms_register_provider` — same thing but programmatic. An admin can register/test credentials via a tool call instead of the UI.

The providers are pluggable — the admin picks which service to use for each slot (Twilio for telephony, Resend for email, etc.). The code calls interfaces, never vendor-specific APIs directly.

## End-to-end flow

1. Admin configures providers (UI or API) → sets up Twilio, Resend, ElevenLabs keys
2. Third-party system connects to MCP via SSE
3. Admin provisions an agent → phone number bought, email generated, WhatsApp assigned, voice configured — all in one call
4. Agent uses its token to send messages, make calls, or initiate voice AI conversations
5. Inbound messages hit webhooks → get forwarded back to the agent's brain (callback URL)
