<!-- version: 1.1 | updated: 2026-02-22 -->

# Onboarding Guide — AgentOS Communication MCP Server

## What This Server Does

This is an MCP (Model Context Protocol) server that gives AI agents the ability to communicate through real channels — SMS, phone calls, email, and WhatsApp. Your AI agent connects via SSE, discovers available tools, and uses them to send messages, make calls, and receive inbound communications.

The server is **infrastructure only** — it handles the plumbing (Twilio, Resend, TTS) but never generates AI responses itself. Your agent provides all the intelligence.

---

## Prerequisites

- **Node.js 22+** and npm
- **Twilio account** — for SMS, voice calls, and WhatsApp
- **Resend account** (optional) — for email. Falls back to mock adapter without it.
- **ElevenLabs account** (optional) — for premium TTS. Falls back to free Edge TTS without it.

---

## Quick Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd agentos-comms-mcp
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Start the server
npm run dev

# 4. Open the setup UI
# Navigate to http://localhost:3100/admin/setup
```

The setup UI at `/admin/setup` lets you configure all providers with test buttons that validate credentials before saving.

---

## Configure Providers

### Twilio (SMS, Voice, WhatsApp)
1. Open `/admin/setup`
2. Enter your Account SID and Auth Token
3. Click **Test Connection** — credentials are saved automatically on success

### ElevenLabs (Premium TTS)
Optional. Without it, the server uses free Edge TTS.
1. Enter your API key in the ElevenLabs card
2. Click **Test Connection**

### Resend (Email)
Required only if you need the email channel.
1. Enter your Resend API key
2. Click **Test Connection**

### Server Settings
1. Set your **Webhook Base URL** — the public URL where Twilio/Resend can reach your server (e.g. your ngrok URL or production domain)
2. Set an **Orchestrator Security Token** — used to authenticate admin tool calls
3. Click **Save**

### Voice Defaults
Optional. Sensible defaults are built in.
- **Greeting** — what the voice says when answering a call
- **Voice ID** — ElevenLabs voice to use
- **Language** — language code (e.g. `en-US`)

After configuring, click **Deploy** to restart the server with the new settings.

---

## Connect Your AI Agent

Your AI agent connects to this server using MCP over SSE (Server-Sent Events).

### 1. Connect via SSE

```
GET http://localhost:3100/sse?token=<your-agent-token>&agentId=your-agent-id
```

The `token` parameter is required for authentication. The `agentId` parameter registers your agent session. This is required for:
- Receiving inbound messages routed to your agent
- Voice call routing (caller talks to *your* agent, not a generic bot)
- Dead letter dispatch (messages collected while you were offline)

### 2. Send Messages via POST

After connecting, send MCP messages to:

```
POST http://localhost:3100/messages
```

Include the `Authorization: Bearer <token>` header if a security token is configured.

### 3. Discover Tools

Once connected, your MCP client can list available tools. The server exposes 11 tools for communication.

### 4. Handle Inbound Messages

When someone texts, emails, or calls your agent's number, the server:
1. Receives the webhook from Twilio/Resend/LINE
2. Forwards it to your connected agent session (or stores as dead letter if offline)
3. Checks channel blocking — blocked channels are silently dropped

For voice calls, the server sends the caller's speech as text to your agent via MCP sampling (`server.createMessage()`), and your agent responds with text that gets spoken back to the caller.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `comms_send_message` | Send SMS, email, or WhatsApp message |
| `comms_get_waiting_messages` | Fetch messages that failed delivery (dead letters) — fetch = acknowledge |
| `comms_send_voice_message` | Send a pre-recorded TTS voice call |
| `comms_make_call` | Start a live AI voice conversation |
| `comms_provision_channels` | Provision phone number, WhatsApp, email for a new agent |
| `comms_deprovision_channels` | Release all channels for an agent |
| `comms_get_channel_status` | Get channel configuration and message counts |
| `comms_register_provider` | Register and verify third-party credentials |
| `comms_set_agent_limits` | Set rate limits and spending caps (admin only) |
| `comms_get_usage_dashboard` | View usage stats, costs, and limits |

---

## Channel Requirements

| Channel | Required Credentials | Notes |
|---------|---------------------|-------|
| **SMS** | Twilio Account SID + Auth Token | Need a phone number (provision via tool or buy manually) |
| **Voice** | Twilio Account SID + Auth Token | Same Twilio creds as SMS. ElevenLabs optional (for TTS) |
| **Email** | Resend API Key | Need a verified domain for sending |
| **WhatsApp** | Twilio Account SID + Auth Token | Needs WhatsApp sender (sandbox or verified number) |
| **LINE** | LINE Channel Secret + Access Token | Needs LINE Official Account |

---

## Voice Calls — How It Works

When a call comes in:

1. **Agent connected?** The server routes the caller's speech to your agent via MCP sampling. Your agent decides what to say. The response is spoken back via Twilio ConversationRelay.

2. **Agent not connected?** The server activates the **answering machine** — a built-in fallback (using Anthropic Claude, if configured) that apologizes, collects the caller's message and preferences, and stores everything in the dead letters queue.

3. **No Anthropic key?** The server plays a hard-coded "unavailable" message.

When your agent reconnects, all dead letters collected while offline are automatically dispatched as notifications.

**Key point:** Your agent is the brain. The server is the telephone. During live calls, the server never generates AI responses — it only relays between the caller and your agent.

---

## Startup Warnings

When the server starts, it checks for missing configuration and logs warnings:

- `[WARN] No Twilio credentials` — telephony channels use mock adapters
- `[WARN] No Resend API key` — email uses mock adapter
- `[WARN] Webhook URL is localhost` — inbound webhooks won't work externally
- `[WARN] No orchestrator security token` — tool calls unauthenticated
- `[INFO] No ElevenLabs key` — using free Edge TTS
- `[INFO] No Anthropic key` — answering machine disabled

These are warnings, not errors. The server always starts.
