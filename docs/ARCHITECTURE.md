# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent (MCP Client)               │
│         Claude Desktop / Cursor / Custom              │
└────────────────────┬────────────────────────────────┘
                     │ SSE (MCP Protocol)
                     ▼
┌─────────────────────────────────────────────────────┐
│              AgentOS Comms MCP Server                  │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ MCP Tools │  │ Webhooks │  │ Admin UI         │   │
│  │ (15 tools)│  │ (6 routes)│  │ Setup/Dashboard  │   │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘   │
│       │              │                                │
│  ┌────┴──────────────┴────────────────────────────┐  │
│  │              Security Layer                     │  │
│  │  Auth │ Sanitizer │ Rate Limiter │ Compliance   │  │
│  └────┬───────────────────────────────────────────┘  │
│       │                                               │
│  ┌────┴───────────────────────────────────────────┐  │
│  │           Provider Interfaces                   │  │
│  │  Telephony │ Email │ WhatsApp │ TTS │ STT │ DB │  │
│  └────┬───────────────────────────────────────────┘  │
│       │                                               │
│  ┌────┴───────────────────────────────────────────┐  │
│  │           Provider Adapters                     │  │
│  │  Twilio │ Resend │ ElevenLabs │ SQLite │ S3    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │           │           │           │
         ▼           ▼           ▼           ▼
      Twilio      Resend     ElevenLabs   SQLite/S3
      (SMS/Voice) (Email)    (TTS)        (Storage)
```

## Data Flow

### Outbound Message
```
Agent → comms_send_message → Auth → Sanitize → Compliance Check
  → Rate Limit → Provider.send() → Log Usage → Return Result
```

### Inbound Message
```
Provider Webhook → Signature Verify → Replay Check
  → Parse → Store Metadata → Forward to Agent Callback
```

### Live Voice Call
```
Inbound Call → Webhook → ConversationRelay TwiML → WebSocket
  → Human speaks → STT (by Twilio) → Text to Agent (via MCP sampling)
  → Agent responds → Text to Twilio → TTS (by Twilio) → Human hears
```

### Fallback (Agent Not Connected)
```
Inbound Call → WebSocket → Agent not connected
  → Built-in Anthropic LLM as answering machine
  → Collects message → Stores voicemail
  → Agent reconnects → Voicemail dispatched
```

## Key Components

### Entry Point (index.ts)
Express app + MCP server. Middleware order:
1. Trust proxy
2. Security headers
3. CORS
4. HTTP rate limiter
5. Body parsers (1MB limit)
6. Routes (webhooks, admin, SSE)
7. IP filter on /admin

### MCP Server (server.ts)
Registers all 15 tools. Handles SSE transport for client connections.

### Provider Factory (factory.ts)
Resolves config → adapter instances. Demo mode → mock adapters.

### Security Layer
- **auth-guard.ts** — `requireAgent()` / `requireAdmin()` for tool callbacks
- **token-manager.ts** — Token generation, hashing, verification
- **sanitizer.ts** — Input validation (SQL injection, XSS, etc.)
- **rate-limiter.ts** — Per-agent action/spending limits
- **compliance.ts** — Content filter, DNC, TCPA, CAN-SPAM, GDPR
- **webhook-signature.ts** — Twilio/Resend signature verification + replay prevention

### Voice Pipeline
- **voice-sessions.ts** — In-memory store for active call configs
- **voice-ws.ts** — WebSocket handler (setup/prompt/interrupt/dtmf)
- **agent-registry.ts** — Maps agentId → MCP Server session for sampling
- **voicemail-dispatcher.ts** — Dispatches voicemails on agent reconnect

### Observability
- **metrics.ts** — Prometheus counters/gauges
- **audit-log.ts** — SHA-256 hash-chained event log
- **alert-manager.ts** — Severity-routed alerts
- **anomaly-detector.ts** — Volume spikes, brute force, rapid rotation

## Database Schema

```
agent_channels ←── messages
     │              call_logs
     │              usage_logs
     │              spending_limits
     │              agent_tokens
     │              billing_config
     │
     ├── agent_pool
     ├── whatsapp_pool
     ├── provider_credentials
     ├── dnc_list
     ├── erasure_requests
     ├── voicemail_messages
     └── audit_log
```

## Concurrency

- Stateless tool execution — no shared in-memory state between requests
- Provider-level parallelism — multiple agents operate simultaneously
- Channel independence — SMS, voice, email, WhatsApp on separate providers
- Database as coordination layer — SQLite transactions for dev, Postgres for production
- Scaling: single-process → multi-process Postgres → horizontal stateless workers
