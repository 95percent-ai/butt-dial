# AgentOS Communication MCP Server

An MCP server that gives AI agents full communication abilities: phone calls, SMS, email, and WhatsApp. Agents can talk to humans or other AI agents. The recipient doesn't need to know if the sender is human or AI.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment config
cp .env.example .env
# Edit .env with your credentials

# 3. Build
npm run build

# 4. Seed test data
npm run seed

# 5. Start server
node dist/index.js
```

The server starts on port 3100 (default). Visit:
- **Setup wizard:** http://localhost:3100/admin/setup
- **API docs:** http://localhost:3100/admin/api-docs
- **Dashboard:** http://localhost:3100/admin/dashboard
- **Health check:** http://localhost:3100/health

## Demo Mode

Set `DEMO_MODE=true` in `.env` to run with mock providers. No real API calls, no costs. All tools work with simulated responses.

## Connect an AI Agent

```bash
# MCP SSE endpoint
http://localhost:3100/sse

# With authentication
http://localhost:3100/sse?token=<agent-security-token>
```

Any MCP-compatible client (Claude Desktop, Cursor, custom orchestrators) can connect.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `comms_send_message` | Send SMS, email, or WhatsApp |
| `comms_make_call` | Initiate AI voice call |
| `comms_send_voice_message` | TTS voice message via phone/WhatsApp |
| `comms_get_messages` | Retrieve message history |
| `comms_transfer_call` | Transfer live call to human |
| `comms_provision_channels` | Set up channels for new agent |
| `comms_deprovision_channels` | Tear down agent channels |
| `comms_get_channel_status` | Check channel health |
| `comms_onboard_customer` | Full automated onboarding |
| `comms_register_provider` | Register provider credentials |
| `comms_set_agent_limits` | Configure rate/spending limits |
| `comms_get_usage_dashboard` | Usage stats and costs |
| `comms_get_billing_summary` | Billing with markup breakdown |
| `comms_set_billing_config` | Set tier, markup, billing email |
| `comms_ping` | Health check / connectivity test |

## Documentation

| Doc | What |
|-----|------|
| [SETUP.md](docs/SETUP.md) | Full setup guide |
| [MCP-TOOLS.md](docs/MCP-TOOLS.md) | Tool reference with examples |
| [API.md](docs/API.md) | REST API reference |
| [PROVIDERS.md](docs/PROVIDERS.md) | Provider adapter guide |
| [SECURITY.md](docs/SECURITY.md) | Security model and hardening |
| [OBSERVABILITY.md](docs/OBSERVABILITY.md) | Monitoring and alerts |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |

## Tech Stack

- **Runtime:** Node.js 22+ / TypeScript
- **MCP:** @modelcontextprotocol/sdk (SSE transport)
- **HTTP:** Express 5
- **Database:** SQLite (dev) / Postgres (production)
- **Telephony:** Twilio (default), Vonage
- **Email:** Resend
- **TTS:** Edge TTS (free), ElevenLabs, OpenAI
- **STT:** Deepgram
- **Voice:** Twilio ConversationRelay (live AI conversations)

## License

Proprietary — 95percent.ai
