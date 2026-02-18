# Setup Guide

## Prerequisites

- Node.js 22+
- npm
- A Twilio account (for SMS/voice)
- Optional: Resend account (email), ElevenLabs (TTS), Deepgram (STT)

## Installation

```bash
git clone <repo-url>
cd agentos-comms-mcp
npm install
cp .env.example .env
```

## Configuration

Edit `.env` with your credentials. Minimum for demo mode:

```env
PORT=3100
DEMO_MODE=true
```

For real providers:

```env
PORT=3100
DEMO_MODE=false

# Distribution edition (community | enterprise | saas)
EDITION=community

# Required for SMS/voice
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...  # Optional: A2P 10DLC messaging service

# Required for email
RESEND_API_KEY=re_...

# Optional TTS (falls back to Edge TTS which is free)
ELEVENLABS_API_KEY=sk_...

# Security
MASTER_SECURITY_TOKEN=your-secret-token
WEBHOOK_BASE_URL=https://your-domain.com

# Data retention (days, 0 = keep forever)
DATA_RETENTION_ENABLED=true
DATA_RETENTION_MESSAGES_DAYS=90
DATA_RETENTION_VOICEMAIL_DAYS=30
DATA_RETENTION_OTP_DAYS=1
```

See `.env.example` for all available options.

## Build & Start

```bash
npm run build
npm run seed    # Creates test agent (test-agent-001)
node dist/index.js
```

## Web Setup Wizard

Visit http://localhost:3100/admin/setup for guided setup:

1. Enter Twilio credentials → test → auto-saves
2. Enter ElevenLabs key → test → auto-saves
3. Enter Resend key → test → auto-saves
4. Configure server settings (webhook URL, master token)
5. Set voice defaults (greeting, language, voice)

Each card tests credentials live before saving.

## Verify

```bash
# Health check
curl http://localhost:3100/health

# Should return: {"status":"ok",...}
```

## Expose Webhooks (Development)

For inbound messages/calls, expose your local server:

```bash
ngrok http 3100
# Copy the HTTPS URL to WEBHOOK_BASE_URL in .env
```

## Provider Configuration

| Provider | Env Vars | Purpose |
|----------|----------|---------|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS, voice, WhatsApp |
| Resend | `RESEND_API_KEY` | Email |
| ElevenLabs | `ELEVENLABS_API_KEY` | Premium TTS |
| Edge TTS | None (free) | Default TTS |
| Deepgram | `DEEPGRAM_API_KEY` | Speech-to-text |
| Vonage | `VONAGE_API_KEY`, `VONAGE_API_SECRET` | Alternative telephony |

## Identity & Isolation Modes

```env
IDENTITY_MODE=dedicated           # Each agent gets own number/email
ISOLATION_MODE=single-account     # Single provider account for all agents
```

Only `dedicated` + `single-account` are currently implemented.

## Running Tests

```bash
# Set demo mode first
# Edit .env: DEMO_MODE=true

npm run build
node dist/index.js &
npx tsx tests/<test-file>.test.ts
```
