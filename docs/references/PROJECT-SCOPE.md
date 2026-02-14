# AgentOS Communication MCP Server — Claude Code Project Prompt

## What This Is

You are building an **MCP (Model Context Protocol) server** that gives any AI agent full in/out communication abilities across 4 channels: **phone calls, SMS, email, and WhatsApp** — including text messages, voice messages, images, and file attachments. The MCP server is a tool layer that agents call to communicate with **humans or other AI agents** through real phone numbers and email addresses.

This is **not** a chatbot. This is infrastructure — a communication primitive that any AI agent can use to reach a human **or another AI agent** on their phone, in their inbox, or on WhatsApp, and receive responses back. The target recipient does not need to know whether the sender is human or AI — the communication layer is identity-agnostic. An agent can call a human's phone, send an SMS to another agent's provisioned number, or email a team inbox — all through the same unified tool interface.

### Standalone Product

This MCP server is designed as a **standalone product**. While it integrates into the AgentOS ecosystem, it operates independently and can be connected to **any third-party platform** via authenticated MCP connections. Any system that speaks MCP (Claude Desktop, Cursor, custom orchestrators, other agent frameworks) can authenticate and use this server's communication capabilities. The server does not assume or require AgentOS — it only requires a valid security token and a registered agent identity.

## Context: Where This Fits

This MCP server is part of **AgentOS** (by 95percent.ai), a platform that creates AI agents dynamically for SMBs. Each agent is spun up on demand with its own identity, tools, and communication channels. The communication MCP server is **Layer 3 ("Hands")** in the AgentOS architecture — the layer that lets agents interact with the outside world.

### Layer 3 — "Hands" (Communication Layer)

In the AgentOS architecture, layers are stacked:
- **Layer 1 ("Brain")** — LLM reasoning, system prompts, memory
- **Layer 2 ("Eyes")** — Data retrieval, knowledge bases, context gathering
- **Layer 3 ("Hands")** — **This server.** The action layer. Agents use their "hands" to reach out — making phone calls, sending messages, writing emails. Every outbound action and every inbound response flows through this layer.
- **Layer 4 ("Legs")** — Integrations with business tools (CRM, calendars, payments)

The "Hands" metaphor is deliberate: this layer does not think, does not store private context, and does not make decisions. It executes communication actions on behalf of the agent and routes inbound messages back to the brain. It is a **pure communication utility**.

### Agent-to-Agent Communication

Agents can communicate with each other through the same channels they use to reach humans. When Agent A calls Agent B's provisioned phone number, Agent B's voice AI handler picks up and converses in real-time — two LLMs talking via phone. This enables multi-agent workflows: a "sales agent" can hand off to a "scheduling agent" by calling its number, a "supervisor agent" can check in on a "field agent" via SMS, or an "escalation agent" can email a summary to a "reporting agent." The communication layer treats all endpoints identically — it does not distinguish between human and AI recipients.

When an agent is created, AgentOS calls this MCP server to:
1. Provision a phone number (instant — via telephony provider API)
2. Configure voice handling (instant — webhook app)
3. Register a WhatsApp sender (minutes-hours — Meta review)
4. Set up an email identity (instant — email provider subdomain)
5. Store the channel mapping in the agent's registry

From that point, the agent can send and receive across all channels using MCP tool calls.

---

## Tech Stack — Pluggable Provider Architecture

The communication layer uses a **provider adapter pattern**. Every external dependency (telephony, email, voice AI, database) is accessed through an abstract interface, allowing the deploying user to select their preferred provider at configuration time. Providers are hot-swappable — changing a provider requires only updating the configuration, not the code.

### Provider Interfaces

| Slot | Interface | Default Provider | Alternative Examples |
|------|-----------|-----------------|---------------------|
| Runtime | — | **Node.js 22+** / TypeScript | — (fixed) |
| MCP Framework | — | **@modelcontextprotocol/sdk** | — (fixed) |
| Telephony | `ITelephonyProvider` | **Twilio** (Voice + SMS + WhatsApp) | Vonage, Plivo, Telnyx, SignalWire |
| Email | `IEmailProvider` | **SendGrid** | Resend, Postmark, AWS SES, Mailgun |
| Voice AI (TTS) | `ITTSProvider` | **ElevenLabs** | WAPI.ai, PlayHT, Deepgram Aura, OpenAI TTS, Azure Speech |
| Voice AI (STT) | `ISTTProvider` | **Deepgram** | Whisper, Google Speech, Azure Speech, AssemblyAI |
| Voice Orchestration | `IVoiceOrchestrator` | **Twilio ConversationRelay** | Media Streams DIY, LiveKit, Daily.co |
| Database | `IDBProvider` | **Supabase** (Postgres) | Convex, PlanetScale, Turso (libSQL), Neon, SQLite (local dev), any Postgres |
| Object Storage | `IStorageProvider` | **Supabase Storage** | AWS S3, Cloudflare R2, MinIO (local) |
| Transport | — | **HTTP/SSE** (MCP standard) | — (fixed) |

### How Provider Selection Works

```typescript
// providers.config.ts — user selects providers at deploy time
export const providerConfig = {
  telephony: "twilio",          // or "vonage", "plivo", "telnyx"
  email: "sendgrid",            // or "resend", "postmark", "ses"
  tts: "elevenlabs",            // or "wapi", "playht", "openai-tts"
  stt: "deepgram",              // or "whisper", "google-speech"
  voiceOrchestration: "twilio-conversation-relay",  // or "media-streams-diy"
  database: "supabase",         // or "convex", "turso", "sqlite", "postgres"
  storage: "supabase-storage",  // or "s3", "r2", "minio"
};

// The adapter factory resolves the correct implementation
const telephony = ProviderFactory.create<ITelephonyProvider>(config.telephony);
const tts = ProviderFactory.create<ITTSProvider>(config.tts);
```

Each provider adapter implements the same interface, so the core MCP tools never reference a specific vendor — they call `telephony.makeCall()`, `email.send()`, `tts.synthesize()`, etc. This means swapping ElevenLabs for WAPI, or Supabase for Convex, requires zero changes to any tool, webhook, or provisioning logic.

---

## Project Structure

```
agentos-comms-mcp/
├── CLAUDE.md                          # Project instructions (this file, condensed)
├── package.json
├── tsconfig.json
├── .env.example
├── providers.config.ts                # User-selected provider configuration
│
├── src/
│   ├── index.ts                       # MCP server entry point
│   ├── server.ts                      # MCP server setup, tool registration
│   │
│   ├── tools/                         # MCP tools (each = one callable function)
│   │   ├── provision-channels.ts      # Provision all comms for a new agent
│   │   ├── deprovision-channels.ts    # Tear down agent's channels
│   │   ├── send-message.ts           # Send message (any channel, any media type)
│   │   ├── make-call.ts             # Initiate outbound phone call (AI voice)
│   │   ├── send-voice-message.ts     # Generate + send pre-recorded voice message
│   │   ├── get-messages.ts           # Retrieve message history for an agent
│   │   ├── get-channel-status.ts     # Check provisioning status of channels
│   │   ├── transfer-call.ts          # Transfer live call to human
│   │   ├── get-usage-dashboard.ts    # Usage stats, costs, limits per agent
│   │   ├── set-agent-limits.ts       # Configure rate limits and spending caps
│   │   └── register-provider.ts      # Register/configure third-party provider credentials
│   │
│   ├── providers/                     # Pluggable provider adapters (Strategy pattern)
│   │   ├── factory.ts                 # Provider factory — resolves config → adapter
│   │   ├── interfaces.ts             # Abstract interfaces: ITelephonyProvider, IEmailProvider, etc.
│   │   ├── telephony/
│   │   │   ├── twilio.ts             # Twilio adapter (default)
│   │   │   ├── vonage.ts             # Vonage adapter
│   │   │   └── plivo.ts              # Plivo adapter
│   │   ├── email/
│   │   │   ├── sendgrid.ts           # SendGrid adapter (default)
│   │   │   ├── resend.ts             # Resend adapter
│   │   │   └── postmark.ts           # Postmark adapter
│   │   ├── tts/
│   │   │   ├── elevenlabs.ts         # ElevenLabs adapter (default)
│   │   │   ├── wapi.ts              # WAPI.ai adapter
│   │   │   └── openai-tts.ts        # OpenAI TTS adapter
│   │   ├── stt/
│   │   │   ├── deepgram.ts           # Deepgram adapter (default)
│   │   │   └── whisper.ts            # Whisper adapter
│   │   ├── database/
│   │   │   ├── supabase.ts           # Supabase adapter (default)
│   │   │   ├── convex.ts             # Convex adapter
│   │   │   ├── turso.ts              # Turso/libSQL adapter
│   │   │   └── sqlite.ts             # Local SQLite adapter (dev/small deployments)
│   │   └── storage/
│   │       ├── supabase-storage.ts   # Supabase Storage adapter (default)
│   │       ├── s3.ts                 # AWS S3 adapter
│   │       └── r2.ts                 # Cloudflare R2 adapter
│   │
│   ├── channels/                      # Channel-specific implementations (use provider interfaces)
│   │   ├── phone.ts                   # Voice — buy number, configure webhooks
│   │   ├── sms.ts                     # SMS — send/receive text + MMS
│   │   ├── whatsapp.ts               # WhatsApp — sender registration, templates
│   │   ├── email.ts                   # Email — send/receive, inbound parse
│   │   └── voice-ai.ts               # Voice orchestration — live 2-way AI voice calls
│   │
│   ├── webhooks/                      # Inbound webhook handlers (provider → agent)
│   │   ├── router.ts                  # Express router for all inbound webhooks
│   │   ├── inbound-sms.ts            # SMS received → route to agent
│   │   ├── inbound-whatsapp.ts       # WhatsApp message received → route to agent
│   │   ├── inbound-call.ts           # Phone call received → TwiML/provider response
│   │   ├── inbound-email.ts          # Email received (inbound parse) → route to agent
│   │   ├── voice-ws.ts               # WebSocket handler for voice orchestration
│   │   └── call-status.ts            # Call status callbacks (completed, failed, etc.)
│   │
│   ├── routing/                       # Route duplication and fan-out
│   │   ├── route-duplicator.ts        # Duplicate actions to secondary routes
│   │   ├── route-config.ts           # Per-agent route duplication rules
│   │   └── fanout.ts                 # Fan-out engine: live call + recording, etc.
│   │
│   ├── security/                      # Security, auth, and abuse prevention
│   │   ├── auth.ts                    # Security token validation (JWT / API key)
│   │   ├── agent-registry.ts         # Agent registration + token issuance
│   │   ├── rate-limiter.ts           # Per-agent rate limiting (sliding window)
│   │   ├── daily-limits.ts           # Daily action caps per agent
│   │   ├── content-filter.ts         # Profanity / harassment / abusive content filter
│   │   ├── compliance.ts             # Regulatory compliance (TCPA, GDPR, DNC lists)
│   │   ├── webhook-signature.ts      # Webhook signature validation (per provider)
│   │   ├── token-manager.ts          # Token issuance, rotation, revocation
│   │   ├── impersonation-guard.ts    # Agent identity verification — prevent spoofed agentIds
│   │   ├── ip-allowlist.ts           # IP allowlist/denylist for admin and webhook endpoints
│   │   ├── ddos-protection.ts        # Request throttling, connection limits, payload size caps
│   │   ├── input-sanitizer.ts        # Sanitize all inputs — prevent injection (SQL, XSS, header)
│   │   └── anomaly-detector.ts       # Detect abnormal patterns (sudden volume spikes, geo anomalies)
│   │
│   ├── observability/                 # Admin observability, monitoring, and alerting
│   │   ├── health-check.ts           # GET /health — liveness + readiness probes
│   │   ├── metrics.ts                # Prometheus-compatible metrics endpoint (GET /metrics)
│   │   ├── structured-logger.ts      # Structured JSON logging (ELK/Datadog/Loki compatible)
│   │   ├── audit-log.ts             # Immutable audit trail — every admin/security event logged
│   │   ├── alert-manager.ts         # Alert routing engine — decides what triggers notifications
│   │   ├── whatsapp-alerter.ts      # Sends WhatsApp notifications to admin on critical events
│   │   └── dashboard-data.ts        # Aggregated observability data for the admin dashboard
│   │
│   ├── admin/                         # Admin API + Setup UI + Swagger
│   │   ├── admin-router.ts           # Express router for admin endpoints (auth-protected)
│   │   ├── setup-wizard-api.ts       # Backend for the setup UI wizard
│   │   ├── swagger.ts                # Swagger/OpenAPI spec generation + Swagger UI serving
│   │   ├── openapi-spec.ts           # OpenAPI 3.1 spec definition for all endpoints + MCP tools
│   │   └── setup-ui/                  # Static setup UI (served at /admin/setup)
│   │       ├── index.html             # Setup wizard — provider config, credentials, pool size
│   │       ├── dashboard.html         # Admin dashboard — live agent status, usage, alerts
│   │       ├── api-explorer.html      # Interactive API tester (Swagger UI wrapper)
│   │       ├── styles.css
│   │       └── app.js
│   │
│   ├── billing/                       # Cost tracking and limits
│   │   ├── cost-tracker.ts           # Per-action cost recording
│   │   ├── spending-limits.ts        # Per-agent and global spending caps
│   │   ├── usage-dashboard.ts        # Aggregate usage stats and cost reporting
│   │   └── provider-billing.ts       # Third-party provider billing passthrough/tracking
│   │
│   ├── provisioning/                  # Dynamic resource provisioning
│   │   ├── phone-number.ts           # Search + buy phone numbers via provider API
│   │   ├── whatsapp-sender.ts        # Register WhatsApp senders via Senders API
│   │   ├── email-identity.ts         # Configure email sender identity
│   │   ├── number-pool.ts            # Pre-provisioned WhatsApp number pool manager
│   │   └── provider-registration.ts  # Auto-register credentials with third-party tools
│   │
│   ├── media/                         # Media handling (voice, images, files)
│   │   ├── tts.ts                     # TTS — generate voice audio (via provider interface)
│   │   ├── media-store.ts            # Upload/download media (via storage provider)
│   │   └── format-converter.ts       # Audio format conversion (μ-law 8kHz etc.)
│   │
│   ├── db/                            # Database layer (via provider interface)
│   │   ├── client.ts                  # DB client (resolved from provider config)
│   │   ├── schema.sql                 # Tables: agent_channels, messages, call_logs, usage_logs, rate_limits
│   │   └── queries.ts                 # Typed queries
│   │
│   └── lib/                           # Shared utilities
│       ├── types.ts                   # Shared TypeScript types
│       ├── config.ts                  # Environment config + validation
│       └── logger.ts                  # Structured logging (no PII in logs)
│
├── scripts/
│   ├── seed-number-pool.ts           # Pre-provision WhatsApp number pool
│   ├── seed-agent-pool.ts            # Pre-provision the initial 5-agent pool
│   ├── migrate.ts                     # Run database migrations
│   ├── generate-openapi.ts           # Generate OpenAPI spec from code
│   └── setup.ts                       # Interactive CLI setup — walks through provider config + credentials
│
├── docs/                              # Documentation
│   ├── README.md                      # Quick start guide
│   ├── SETUP.md                       # Full setup instructions (manual + UI wizard)
│   ├── API.md                         # REST API reference (generated from OpenAPI spec)
│   ├── MCP-TOOLS.md                  # MCP tool reference with examples
│   ├── PROVIDERS.md                  # Provider adapter guide — how to add/swap providers
│   ├── SECURITY.md                   # Security architecture, threat model, hardening guide
│   ├── OBSERVABILITY.md              # Monitoring, alerting, logging guide
│   ├── TROUBLESHOOTING.md            # Common issues and fixes
│   ├── ARCHITECTURE.md               # System architecture diagram + data flow
│   └── CHANGELOG.md                  # Release notes
│
└── tests/
    ├── tools/                         # Tool-level tests
    ├── channels/                      # Channel integration tests
    ├── security/                      # Security + rate limit + attack simulation tests
    ├── providers/                     # Provider adapter tests
    ├── observability/                 # Health check + alerting tests
    ├── webhooks/                      # Webhook handler tests
    └── fixtures/                      # Test fixtures + mock provider responses
        ├── mock-twilio.ts             # Mock Twilio API responses
        ├── mock-sendgrid.ts           # Mock SendGrid API responses
        ├── mock-elevenlabs.ts         # Mock ElevenLabs API responses
        └── scenario-runner.ts         # End-to-end scenario test runner (demo mode)
```

---

## MCP Tools Exposed

These are the tools the MCP server registers. Any MCP client (AgentOS, Claude Desktop, Cursor, etc.) can call them. **All tool calls require a valid security token** (see Security section).

### 1. `comms_provision_channels`
Provision all communication channels for a new agent. Consumes one slot from the agent pool (starting pool: 5 agents).

```typescript
// Input
{
  agentId: string,               // Unique agent identifier
  securityToken: string,         // Required — issued at registration
  displayName: string,           // Business name for WhatsApp profile
  greeting: string,              // Voice greeting for inbound calls
  systemPrompt: string,          // LLM system prompt for voice AI conversations
  country: string,               // ISO country code for phone number (e.g., "US", "IL")
  capabilities: {
    phone: boolean,              // Enable phone calls (voice + SMS)
    whatsapp: boolean,           // Enable WhatsApp
    email: boolean,              // Enable email
    voiceAi: boolean,            // Enable live AI voice conversations
  },
  routeDuplication?: {           // Optional — duplicate routes for secondary outputs
    liveCall?: {
      alsoRecord: boolean,       // Record call in parallel with live conversation
      recordingStorage?: string, // Storage path override for recordings
    },
    sms?: {
      mirrorTo?: string,         // Mirror SMS to a secondary number or webhook
    },
    email?: {
      bccTo?: string,            // BCC all outbound emails to an address
    },
  },
  providerOverrides?: {          // Optional — override default providers for this agent
    telephony?: string,
    email?: string,
    tts?: string,
    stt?: string,
  }
}

// Output
{
  agentId: string,
  channels: {
    phone: { number: string, status: "active" },
    sms: { number: string, status: "active" },
    whatsapp: { number: string, status: "pending_review" | "active" },
    email: { address: string, status: "active" },
    voiceAi: { appSid: string, status: "active" },
  },
  poolSlotsRemaining: number,    // How many agent slots remain (from initial pool of 5)
  provisionedAt: string,
}
```

### 2. `comms_send_message`
Send a message on any channel. Supports text, images, files, audio. Recipient can be a human phone/email OR another agent's provisioned address.

```typescript
// Input
{
  agentId: string,
  securityToken: string,
  to: string,                    // Phone number (E.164), email, OR another agentId (resolved to their number/email)
  channel: "sms" | "whatsapp" | "email",
  body: string,                  // Text content
  mediaUrl?: string,             // URL to image, audio, or file attachment
  mediaType?: "image" | "audio" | "video" | "document",
  subject?: string,              // Email subject (email channel only)
  templateId?: string,           // WhatsApp template ID (for outside 24h window)
  templateVars?: Record<string, string>,
  toAgentId?: string,            // If sending to another AI agent (resolved internally)
}

// Output
{
  messageId: string,
  channel: string,
  status: "sent" | "queued" | "failed" | "rate_limited",
  cost: number,
  timestamp: string,
  rateLimitRemaining: number,    // Actions remaining in current window
}
```

### 3. `comms_make_call`
Initiate an outbound phone call with live AI voice conversation. Can call a human OR another agent.

```typescript
// Input
{
  agentId: string,
  securityToken: string,
  to: string,                    // Phone number to call (E.164)
  context: string,               // Why the agent is calling (injected into LLM prompt)
  voice?: string,                // TTS voice ID (defaults to agent's voice)
  maxDurationMinutes?: number,   // Call duration limit (default: 10)
  toAgentId?: string,            // If calling another AI agent
  routeDuplication?: {
    alsoRecord: boolean,         // Record this call in addition to live conversation
  },
}

// Output
{
  callSid: string,
  status: "initiated" | "ringing" | "in-progress",
  from: string,
  to: string,
}
```

### 4. `comms_send_voice_message`
Generate a voice message with TTS and deliver it as a phone call or WhatsApp audio.

```typescript
// Input
{
  agentId: string,
  securityToken: string,
  to: string,
  text: string,                  // Text to convert to speech
  deliveryChannel: "phone_call" | "whatsapp_audio",
  voice?: string,                // TTS voice ID
  recordResponse?: boolean,      // Record human's reply after playing message
}

// Output
{
  messageId: string,
  audioUrl: string,
  durationSeconds: number,
  deliveryStatus: "sent" | "queued",
  cost: number,
}
```

### 5. `comms_get_messages`
Retrieve message history for an agent (across all channels).

```typescript
// Input
{
  agentId: string,
  securityToken: string,
  channel?: "sms" | "whatsapp" | "email" | "voice" | "all",
  contactNumber?: string,        // Filter by specific contact
  since?: string,                // ISO datetime
  limit?: number,                // Default: 50
}

// Output
{
  messages: Array<{
    id: string,
    channel: string,
    direction: "inbound" | "outbound",
    from: string,
    to: string,
    body: string,
    mediaUrl?: string,
    mediaType?: string,
    timestamp: string,
    status: string,
  }>,
  totalCount: number,
}
```

### 6. `comms_get_channel_status`
Check the provisioning and health status of an agent's channels.

```typescript
// Input
{ agentId: string, securityToken: string }

// Output
{
  agentId: string,
  channels: {
    phone: { number: string, status: "active" | "suspended", monthlyMessages: number },
    whatsapp: { number: string, status: "active" | "pending_review" | "rejected", qualityRating: string },
    email: { address: string, status: "active", deliveryRate: number },
    voiceAi: { status: "active", totalCallMinutes: number },
  },
  monthlyCost: number,
  rateLimits: { actionsThisMinute: number, actionsToday: number, maxPerMinute: number, maxPerDay: number },
}
```

### 7. `comms_deprovision_channels`
Tear down all channels for an agent (release number, close subaccount). Returns the slot to the agent pool.

```typescript
// Input
{ agentId: string, securityToken: string, releaseNumber?: boolean }
```

### 8. `comms_transfer_call`
Transfer a live voice AI call to a human phone number.

```typescript
// Input
{
  agentId: string,
  securityToken: string,
  callSid: string,
  transferTo: string,            // Human's phone number
  announcement?: string,         // What to say before connecting
}
```

### 9. `comms_get_usage_dashboard`
Retrieve usage statistics, costs, and rate limit status for one or all agents.

```typescript
// Input
{
  securityToken: string,
  agentId?: string,              // Omit for all-agents overview
  period?: "today" | "week" | "month" | "all",
}

// Output
{
  agents: Array<{
    agentId: string,
    displayName: string,
    totalActions: number,
    actionsByChannel: { sms: number, whatsapp: number, email: number, voice: number, call: number },
    totalCost: number,
    costByChannel: { sms: number, whatsapp: number, email: number, voice: number, call: number },
    rateLimitHits: number,       // Times this agent was rate-limited
    currentLimits: { maxPerMinute: number, maxPerDay: number, maxSpendPerDay: number },
  }>,
  globalTotals: { totalActions: number, totalCost: number, activeAgents: number, poolSlotsUsed: number },
}
```

### 10. `comms_set_agent_limits`
Configure rate limits and spending caps for a specific agent.

```typescript
// Input
{
  securityToken: string,
  agentId: string,
  limits: {
    maxActionsPerMinute?: number,   // Burst protection (default: 10)
    maxActionsPerHour?: number,     // Sustained rate cap (default: 100)
    maxActionsPerDay?: number,      // Daily cap (default: 500)
    maxSpendPerDay?: number,        // Dollar amount cap per day (default: $10)
    maxSpendPerMonth?: number,      // Dollar amount cap per month (default: $100)
    maxCallDurationMinutes?: number,// Per-call cap (default: 10)
    maxCallsPerDayToSameNumber?: number, // Anti-harassment: max calls to same number (default: 2)
  }
}
```

### 11. `comms_register_provider`
Register or update credentials for a third-party provider. Handles automatic configuration and connectivity verification.

```typescript
// Input
{
  securityToken: string,
  provider: string,              // e.g., "twilio", "sendgrid", "elevenlabs", "wapi", "convex"
  credentials: Record<string, string>,  // Provider-specific credentials
  autoVerify?: boolean,          // Test connectivity on registration (default: true)
}

// Output
{
  provider: string,
  status: "active" | "invalid_credentials" | "pending_verification",
  capabilities: string[],       // What this provider enables (e.g., ["sms", "voice", "whatsapp"])
  billingInfo?: {
    plan: string,
    balance: number,
    currency: string,
  }
}
```

---

## Webhook Architecture

The MCP server also runs an Express HTTP server for inbound webhooks. Telephony and email providers POST to these endpoints when messages/calls arrive. Webhook endpoints are provider-agnostic — the router inspects headers to determine which provider adapter to invoke.

```
POST /webhooks/:agentId/sms           → inbound SMS
POST /webhooks/:agentId/whatsapp      → inbound WhatsApp message
POST /webhooks/:agentId/voice         → inbound phone call (returns provider-specific response)
POST /webhooks/:agentId/email         → inbound email (inbound parse)
POST /webhooks/:agentId/call-status   → call status updates
WSS  /webhooks/:agentId/voice-ws      → Voice orchestration WebSocket (live AI voice)
```

All inbound messages are:
1. Validated (webhook signature checked against the active provider's signing secret)
2. Parsed (extract text, media URLs, sender info)
3. Stored in the `messages` table (**metadata only — no message body stored unless explicitly enabled by the agent owner, see Privacy section**)
4. Forwarded to the agent's message handler (via callback URL)

### Route Duplication

Agents can configure **route duplication** — a single action that automatically fans out to a secondary route. Use cases:
- **Live call + recording:** A voice call is conducted live AND simultaneously recorded to storage. The agent or human can review the recording later.
- **SMS + webhook mirror:** Every outbound SMS is also POST'd to a secondary webhook URL for logging or CRM sync.
- **Email + BCC:** All outbound emails are BCC'd to a compliance or archive address.

Route duplication is configured per-agent at provisioning time (or updated later). The primary action always completes first — the secondary route is best-effort and does not block the primary.

---

## Voice AI Architecture (Provider-Agnostic)

For live 2-way voice calls, the flow is (using default Twilio ConversationRelay as example):

1. **Inbound call** → Telephony provider hits `POST /webhooks/:agentId/voice`
2. **Response** connects to voice orchestration:
   ```xml
   <Response>
     <Connect>
       <ConversationRelay
         url="wss://your-server/webhooks/{agentId}/voice-ws"
         ttsProvider="{configured_tts_provider}"
         voice="{agentVoiceId}"
         welcomeGreeting="{agentGreeting}"
         transcriptionProvider="{configured_stt_provider}"
         interruptible="true"
       />
     </Connect>
   </Response>
   ```
3. **WebSocket handler** receives **text** (not audio — orchestration layer handles STT/TTS):
   - `"prompt"` event → human (or other AI agent) said something (already transcribed)
   - Send to LLM with agent's system prompt
   - Stream LLM response tokens back as `"text"` events
   - Orchestration layer converts to speech via configured TTS provider and plays to caller
   - `"interrupt"` event → caller interrupted, cancel current generation

**Key insight:** Your WebSocket handler only deals with text in/out. The voice layer is completely abstracted by the voice orchestration provider. Swapping ElevenLabs for WAPI, or ConversationRelay for a Media Streams DIY setup, changes nothing in the WebSocket handler.

---

## Database Schema

**Note:** This schema uses standard SQL. The actual implementation is resolved through the database provider adapter (Supabase, Convex, Turso, SQLite, etc.). For non-SQL providers like Convex, these tables map to equivalent document collections.

```sql
-- Agent channel mappings
CREATE TABLE agent_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  phone_number TEXT,
  whatsapp_sender_sid TEXT,
  whatsapp_status TEXT DEFAULT 'pending',
  email_address TEXT,
  voice_app_sid TEXT,
  voice_id TEXT,                    -- TTS voice ID (provider-agnostic)
  system_prompt TEXT,
  greeting TEXT,
  provider_overrides JSONB,         -- Per-agent provider selections (e.g., {"tts": "wapi"})
  route_duplication JSONB,          -- Route duplication config
  status TEXT DEFAULT 'active',
  provisioned_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Message log (metadata only — no private content stored by default)
-- NOTE: The MCP server does NOT store message bodies, media content, or conversation
-- transcripts by default. Only routing metadata (from, to, channel, timestamp, cost)
-- is persisted. The agent owner can opt-in to body storage via configuration,
-- in which case bodies are stored encrypted at rest.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  channel TEXT NOT NULL,            -- sms, whatsapp, email, voice
  direction TEXT NOT NULL,          -- inbound, outbound
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  body TEXT,                        -- NULL by default (privacy-first). Stored only if agent owner opts in.
  media_url TEXT,
  media_type TEXT,
  external_id TEXT,                 -- Provider message ID
  status TEXT DEFAULT 'sent',
  cost NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Call logs
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  call_sid TEXT UNIQUE NOT NULL,
  direction TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  duration_seconds INTEGER,
  recording_url TEXT,               -- Only populated if route duplication recording is enabled
  transcript TEXT,                  -- Only populated if agent owner opts in
  status TEXT,
  cost NUMERIC(10,6),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp number pool (pre-provisioned senders)
CREATE TABLE whatsapp_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  sender_sid TEXT,
  status TEXT DEFAULT 'available',  -- available, assigned, failed
  assigned_to_agent TEXT REFERENCES agent_channels(agent_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent pool management (starting with 5 slots)
CREATE TABLE agent_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  max_agents INTEGER DEFAULT 5,     -- Starting pool size
  active_agents INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent security tokens
CREATE TABLE agent_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  token_hash TEXT NOT NULL,          -- bcrypt hash of the security token
  issued_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,           -- NULL = active, set = revoked
  last_used_at TIMESTAMPTZ,
  created_by TEXT                    -- Who/what created this token
);

-- Usage tracking (per-action cost logging)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  action_type TEXT NOT NULL,         -- send_sms, make_call, send_email, send_whatsapp, voice_minute, etc.
  channel TEXT NOT NULL,
  cost NUMERIC(10,6) NOT NULL,
  provider TEXT NOT NULL,            -- Which provider handled this action
  external_id TEXT,                  -- Provider's transaction ID
  metadata JSONB,                    -- Additional context (duration, recipient country, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limit state (sliding window counters)
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  window_type TEXT NOT NULL,         -- per_minute, per_hour, per_day
  window_start TIMESTAMPTZ NOT NULL,
  action_count INTEGER DEFAULT 0,
  max_actions INTEGER NOT NULL,      -- Configured limit for this window
  UNIQUE(agent_id, window_type, window_start)
);

-- Agent spending limits
CREATE TABLE spending_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE REFERENCES agent_channels(agent_id),
  max_per_minute INTEGER DEFAULT 10,
  max_per_hour INTEGER DEFAULT 100,
  max_per_day INTEGER DEFAULT 500,
  max_spend_per_day NUMERIC(10,2) DEFAULT 10.00,
  max_spend_per_month NUMERIC(10,2) DEFAULT 100.00,
  max_call_duration_minutes INTEGER DEFAULT 10,
  max_calls_per_day_same_number INTEGER DEFAULT 2,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Provider credentials (encrypted)
CREATE TABLE provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,     -- twilio, sendgrid, elevenlabs, wapi, convex, etc.
  credentials_encrypted TEXT NOT NULL, -- AES-256 encrypted credential blob
  status TEXT DEFAULT 'active',      -- active, invalid, pending_verification
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anti-harassment tracking (calls to same number)
CREATE TABLE contact_frequency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agent_channels(agent_id),
  contact_number TEXT NOT NULL,
  channel TEXT NOT NULL,
  action_date DATE NOT NULL,
  action_count INTEGER DEFAULT 1,
  UNIQUE(agent_id, contact_number, channel, action_date)
);

-- Indexes for performance
CREATE INDEX idx_usage_logs_agent_date ON usage_logs(agent_id, created_at);
CREATE INDEX idx_rate_limits_agent_window ON rate_limits(agent_id, window_type, window_start);
CREATE INDEX idx_messages_agent_date ON messages(agent_id, created_at);
CREATE INDEX idx_contact_freq_lookup ON contact_frequency(agent_id, contact_number, action_date);
```

---

## Environment Variables

```bash
# ─── Server ───────────────────────────────────────────────────
PORT=3100
WEBHOOK_BASE_URL=https://comms.yourdomain.com
MCP_SERVER_NAME=agentos-comms
NODE_ENV=production

# ─── Security ─────────────────────────────────────────────────
# Master token for initial admin access / agent registration
MASTER_SECURITY_TOKEN=...
# Encryption key for provider credentials stored in DB (AES-256)
CREDENTIALS_ENCRYPTION_KEY=...
# JWT signing secret for agent security tokens
JWT_SECRET=...

# ─── Agent Pool ───────────────────────────────────────────────
INITIAL_AGENT_POOL_SIZE=5          # Starting pool — 5 agents max

# ─── Provider Credentials (defaults — can also be registered via MCP tool) ───
# Telephony (default: Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Email (default: SendGrid)
SENDGRID_API_KEY=SG...
SENDGRID_INBOUND_DOMAIN=agents.yourdomain.com

# TTS (default: ElevenLabs)
ELEVENLABS_API_KEY=...
ELEVENLABS_DEFAULT_VOICE=cgSgspJ2msm6clMCkdW9

# Database (default: Supabase — override with CONVEX_URL, TURSO_URL, or SQLITE_PATH)
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...

# ─── Provider Selection (see providers.config.ts for full list) ───
PROVIDER_TELEPHONY=twilio
PROVIDER_EMAIL=sendgrid
PROVIDER_TTS=elevenlabs
PROVIDER_STT=deepgram
PROVIDER_DATABASE=supabase
PROVIDER_STORAGE=supabase-storage

# ─── Callback (where to forward inbound messages) ────────────
AGENTOS_CALLBACK_URL=https://api.yourdomain.com/agents/{agentId}/inbound

# ─── Rate Limit Defaults ─────────────────────────────────────
DEFAULT_MAX_ACTIONS_PER_MINUTE=10
DEFAULT_MAX_ACTIONS_PER_HOUR=100
DEFAULT_MAX_ACTIONS_PER_DAY=500
DEFAULT_MAX_SPEND_PER_DAY=10.00
DEFAULT_MAX_SPEND_PER_MONTH=100.00
DEFAULT_MAX_CALLS_PER_DAY_SAME_NUMBER=2

# ─── Admin Observability + Alerts ─────────────────────────────
ADMIN_WHATSAPP_NUMBER=+972...       # Admin's WhatsApp number for notifications (E.164)
ADMIN_ALERT_MIN_SEVERITY=MEDIUM     # LOW, MEDIUM, HIGH, CRITICAL
ADMIN_ALERT_QUIET_HOURS_START=23    # No LOW/MEDIUM alerts during quiet hours
ADMIN_ALERT_QUIET_HOURS_END=7
ADMIN_ALERT_TIMEZONE=Asia/Jerusalem
ADMIN_TOKEN=...                      # Separate admin auth token for /admin/* endpoints

# ─── Demo / Sandbox Mode ─────────────────────────────────────
DEMO_MODE=false                      # Set to true for mock providers, no real calls/SMS/emails
```

---

## Expected Results

When complete, this MCP server should:

1. **Provision in <10 seconds:** Phone + SMS + Email active instantly. WhatsApp assigned from pool (or pending Meta review). Agent consumes one slot from the 5-agent pool.
2. **Send any message type:** Text, images, files, voice notes — across SMS, WhatsApp, and email — with a single `comms_send_message` tool call.
3. **Agent-to-agent communication:** Agent A can call, SMS, or email Agent B using the same tools used to reach humans. The communication layer is identity-agnostic.
4. **Receive and route:** All inbound messages across all channels routed to the correct agent with media attachments preserved.
5. **Live AI voice calls:** A human (or another agent) can call the agent's phone number and have a real-time conversation with an LLM-powered voice agent (sub-second latency).
6. **Outbound AI calls:** The agent can call a human or another agent and conduct a voice conversation, or play a pre-generated voice message.
7. **Route duplication:** An action can fan out to a secondary route (e.g., live call + recording, SMS + webhook mirror, email + BCC).
8. **Pluggable providers:** Telephony, email, TTS, STT, database, and storage providers are swappable via configuration. No vendor lock-in.
9. **Multi-tenant isolation:** Each agent's resources are isolated with independent billing tracking.
10. **Security tokens:** Every agent is registered with a unique security token. All tool calls are authenticated. Tokens can be rotated and revoked.
11. **Rate limiting and abuse prevention:** Per-agent rate limits (per-minute, per-hour, per-day), spending caps, anti-harassment rules (max calls/day to same number), and content filtering (profanity, abusive language).
12. **Usage dashboard:** Real-time usage stats and cost breakdown per agent, per channel, per period — accessible via `comms_get_usage_dashboard`.
13. **Privacy-first:** The MCP server does not store message bodies, conversation transcripts, or private content by default. Only routing metadata is persisted. Body storage is opt-in and encrypted.
14. **Standalone product:** Operates independently of AgentOS. Any MCP-compatible client can authenticate and use the server.
15. **Clean teardown:** Deprovisioning releases all resources, returns the pool slot, and optionally returns the phone number to the pool.
16. **Admin observability:** Health checks, Prometheus metrics, structured logging, and immutable audit trail. The administrator has full visibility into system state.
17. **WhatsApp admin alerts:** The administrator receives real-time WhatsApp notifications on critical system events (agent failures, spending cap breaches, security incidents, provider outages).
18. **Swagger / API explorer:** Full OpenAPI 3.1 spec with interactive Swagger UI at `/admin/api-docs` for demo testing and integration development.
19. **Setup UI wizard:** Web-based setup wizard at `/admin/setup` that walks through provider configuration, credential entry, pool sizing, and initial agent provisioning — no CLI required.
20. **Comprehensive documentation:** README, setup guide, API reference, MCP tool reference, provider guide, security architecture doc, and troubleshooting guide.
21. **Hardened against attacks:** Impersonation prevention, DDoS protection, input sanitization, IP allowlisting, anomaly detection, and defense against replay attacks.

---

## Key Constraints

### Operational
- **Agent pool starts at 5.** The system launches with a 5-agent pool. Pool size can be increased but must be explicitly expanded — no unbounded agent creation.
- **WhatsApp is the bottleneck.** It cannot be provisioned instantly. Use the number pool strategy (pre-register 10-50 senders, assign from pool on agent creation, replenish in background).
- **WhatsApp 24-hour window.** Outside customer-initiated 24h window, only pre-approved templates can be sent. Register templates early.
- **US SMS requires A2P 10DLC.** First campaign registration takes 1-2 weeks. Plan ahead.
- **Provider credentials must be registered.** Third-party provider credentials are registered via `comms_register_provider` (preferably automatic at first boot). The MCP handles billing visibility and support routing for each provider.

### Security
- **Every tool call requires a security token.** No anonymous access. Tokens are issued at agent registration, hashed in the DB, and validated on every request.
- **Tokens must be rotatable and revocable.** If a token is compromised, it can be revoked instantly and a new one issued.
- **Webhook signatures are always validated.** Every inbound webhook is checked against the active provider's signing secret. Unsigned requests are rejected.
- **Provider credentials are encrypted at rest.** All third-party API keys stored in the DB are encrypted with AES-256.
- **No PII in logs.** Structured logging never includes phone numbers, email addresses, message content, or security tokens. Use agent IDs and message IDs only.

### Attack Prevention and Hardening
- **Impersonation prevention.** An agent's security token is cryptographically bound to its `agentId`. A valid token for Agent A cannot be used to act as Agent B. The `impersonation-guard.ts` module validates that the token's embedded identity matches the requested `agentId` on every call. Spoofed `agentId` values in tool calls, webhook payloads, or WebSocket connections are rejected immediately.
- **Caller ID spoofing defense.** Inbound webhooks validate the request origin using the provider's signing secret (e.g., Twilio's `X-Twilio-Signature`). Even if an attacker crafts a webhook POST with a fake `agentId` in the URL, the signature check fails and the request is dropped. No action is taken on unsigned inbound traffic.
- **DDoS and flood protection.** The `ddos-protection.ts` module enforces: (a) global request rate limits (e.g., 1000 req/s across all endpoints), (b) per-IP rate limits (e.g., 100 req/min per IP), (c) maximum request payload size (e.g., 1MB), (d) connection limits per IP, (e) slowloris protection via request timeout (e.g., 30s). These limits are applied at the Express middleware layer BEFORE any business logic runs.
- **Input sanitization.** All inputs — tool call parameters, webhook payloads, query strings, headers — are sanitized by `input-sanitizer.ts` before processing. This prevents: SQL injection (parameterized queries only, no string interpolation), XSS (HTML entities escaped in any stored/reflected content), header injection (CRLF characters stripped), path traversal (path segments validated), and command injection (no shell execution of user input).
- **Replay attack prevention.** Webhook requests include a timestamp. Requests older than 5 minutes are rejected. Combined with signature validation, this prevents captured webhook payloads from being replayed.
- **Anomaly detection.** The `anomaly-detector.ts` module monitors for suspicious patterns in real-time: (a) sudden volume spikes from a single agent (10x normal in 5 minutes), (b) agent making calls to an unusual geographic region, (c) rapid token rotation (possible credential stuffing), (d) repeated failed authentication attempts (brute force), (e) same IP hitting multiple different agent endpoints (scanning). Anomalies trigger an alert to the admin via WhatsApp (see Observability section) and can auto-suspend the offending agent.
- **Admin endpoints are separately authenticated.** The `/admin/*` routes use a separate admin token (or basic auth) that is distinct from agent security tokens. Admin tokens have higher privilege and should be rotated frequently.
- **CORS and CSP.** The Express server sets strict CORS headers (allowlist only the setup UI origin) and Content Security Policy headers on all responses. The Swagger UI and setup wizard are served with restrictive CSP.

### Regulatory and Legal Compliance
- **Call recording consent.** Voice handler MUST announce recording in jurisdictions that require two-party consent (California, Illinois, etc. in the US; most of the EU).
- **Do-Not-Call (DNC) list compliance.** Before making outbound calls, check the recipient against the national DNC registry. Block calls to numbers on the list.
- **TCPA compliance (US).** Outbound calls and SMS must comply with the Telephone Consumer Protection Act — consent tracking, time-of-day restrictions (no calls before 8am or after 9pm local time), and opt-out handling.
- **GDPR compliance (EU).** If the recipient is in the EU, ensure consent is tracked, data minimization is applied, and right-to-erasure requests can be honored.
- **Anti-harassment protections.** The system enforces hard limits on how many times an agent can contact the same number in a day (default: 2 calls/day, configurable via `comms_set_agent_limits`). Exceeding this is blocked, not just logged.
- **Content filtering.** Outbound voice and text content is passed through a profanity/harassment filter. Agents cannot send messages containing hate speech, threats, explicit sexual content, or other abusive language. The filter is applied BEFORE the action reaches the provider.
- **CAN-SPAM compliance (email).** All outbound emails must include a valid physical address and an unsubscribe mechanism.

### Cost Awareness
- **Every action has a cost.** SMS, calls, emails, TTS generation — everything costs money. Every action's cost is logged in `usage_logs` and attributed to the specific agent.
- **Default provider costs (approximate):**
  - Voice call (ConversationRelay): ~$0.09–0.11/min
  - Voice call (Media Streams DIY): ~$0.03–0.06/min
  - SMS (US): ~$0.0079/segment
  - WhatsApp: ~$0.005–0.08/message (varies by country and template)
  - Email: ~$0.001/email
  - TTS generation: ~$0.01–0.03/minute of audio
- **Spending caps are enforced, not advisory.** When an agent hits its daily or monthly spending cap, further actions are blocked with a `rate_limited` status.
- **The usage dashboard is always available.** `comms_get_usage_dashboard` provides real-time cost and usage visibility per agent, per channel, per time period.

### Rate Limiting and Abuse Prevention
- **Per-minute burst protection (default: 10 actions/min).** Prevents runaway agents from burning through resources in seconds.
- **Per-hour sustained rate cap (default: 100 actions/hour).** Catches agents stuck in loops.
- **Per-day daily cap (default: 500 actions/day).** Hard ceiling on daily activity.
- **Per-number frequency cap (default: 2 calls/day to same number).** Anti-harassment protection.
- **All limits are configurable per agent** via `comms_set_agent_limits`.
- **Rate limit responses include remaining quota** so the calling agent/orchestrator can throttle proactively.

---

## Privacy Architecture

The MCP server is designed as a **privacy-first communication utility**. It does NOT function as a data store for private communications.

### What IS Stored (by default)
- Agent channel mappings (which agent owns which phone number/email)
- Routing metadata: from, to, channel, direction, timestamp, status, cost
- Usage logs: action type, cost, provider, timestamp
- Rate limit counters
- Provider credentials (encrypted)

### What is NOT Stored (by default)
- Message bodies (SMS, WhatsApp, email content)
- Conversation transcripts (voice calls)
- Media files (images, audio, documents)
- LLM system prompts or conversation history
- Any PII beyond routing addresses

### Opt-in Storage
The agent owner can explicitly enable body storage for specific channels. When enabled:
- Bodies are encrypted at rest (AES-256)
- A retention period is configured (default: 30 days, then auto-deleted)
- The agent owner can request erasure at any time

This design ensures the MCP server is a **communication router, not a surveillance tool**. It moves messages through — it does not read or retain them.

---

## Admin Observability

The administrator needs full visibility into the system without reading private messages. Observability is structured in four layers:

### 1. Health Checks
```
GET /health          → { status: "ok", uptime: 12345, version: "1.0.0" }
GET /health/ready    → { status: "ready", providers: { twilio: "ok", sendgrid: "ok", ... } }
```
Standard liveness and readiness probes for container orchestration (K8s, ECS, etc.). The readiness check verifies connectivity to all configured providers.

### 2. Metrics (Prometheus-compatible)
```
GET /metrics         → Prometheus text format
```
Exposes counters and gauges:
- `comms_actions_total{agent, channel, action_type}` — total actions per agent per channel
- `comms_action_cost_total{agent, channel}` — cumulative cost per agent per channel
- `comms_action_duration_seconds{action_type}` — histogram of action latency
- `comms_rate_limit_hits_total{agent}` — how often each agent is being throttled
- `comms_webhook_requests_total{agent, provider, status}` — inbound webhook volume
- `comms_active_calls{agent}` — gauge of currently live voice calls
- `comms_agent_pool_used` / `comms_agent_pool_total` — pool utilization
- `comms_security_events_total{type}` — auth failures, anomalies, blocked requests

These can be scraped by Prometheus and visualized in Grafana, Datadog, or any compatible monitoring tool.

### 3. Structured Logging
All logs are JSON-formatted with consistent fields:
```json
{
  "level": "info",
  "timestamp": "2026-02-13T10:30:00Z",
  "event": "action_completed",
  "agentId": "agent-123",
  "channel": "sms",
  "action": "send_message",
  "durationMs": 342,
  "cost": 0.0079,
  "messageId": "msg-abc-456"
}
```
**No PII ever appears in logs** — no phone numbers, email addresses, message bodies, or tokens. Logs are compatible with ELK stack, Datadog, Loki, or CloudWatch.

### 4. Audit Trail
An immutable `audit_log` table records every security-relevant event:
- Token issued / rotated / revoked
- Agent provisioned / deprovisioned
- Provider credentials registered / updated
- Rate limit breached
- Anomaly detected
- Admin login / action
- Spending cap hit

The audit log is append-only — no updates or deletes. Each entry includes a SHA-256 hash of the previous entry (hash chain) so tampering is detectable.

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,              -- agentId, "admin", "system"
  target TEXT,                      -- what was acted on
  details JSONB,                    -- event-specific context (no PII)
  prev_hash TEXT NOT NULL,          -- SHA-256 of previous row (hash chain)
  row_hash TEXT NOT NULL            -- SHA-256 of this row
);
```

---

## Admin WhatsApp Notifications

The administrator receives real-time **WhatsApp messages** when critical events occur. The system uses its own communication infrastructure (the same telephony/WhatsApp providers it manages for agents) to notify the admin.

### Alert Categories and Severity

| Severity | Events | Notification |
|----------|--------|-------------|
| **CRITICAL** | Agent security token compromised/revoked, DDoS attack detected, provider API down, anomaly auto-suspended an agent | Immediate WhatsApp message + repeat every 15 min until acknowledged |
| **HIGH** | Agent spending cap breached, agent rate-limited 10+ times in 1 hour, webhook signature validation failure spike, brute-force auth attempt detected | Immediate WhatsApp message |
| **MEDIUM** | Agent provisioning failed, WhatsApp sender rejected by Meta, daily spending exceeds 80% of cap, provider returned unexpected errors | WhatsApp message batched every 30 min (grouped digest) |
| **LOW** | Agent deprovisioned, pool running low (<2 slots), provider credentials nearing expiry | WhatsApp message batched daily (morning digest) |

### Configuration

```bash
# ─── Admin Alerting ──────────────────────────────────────────
ADMIN_WHATSAPP_NUMBER=+972...       # Administrator's WhatsApp number (E.164)
ADMIN_ALERT_MIN_SEVERITY=MEDIUM     # Minimum severity to send (LOW, MEDIUM, HIGH, CRITICAL)
ADMIN_ALERT_QUIET_HOURS_START=23    # Don't send LOW/MEDIUM alerts between 23:00–07:00 local
ADMIN_ALERT_QUIET_HOURS_END=7
ADMIN_ALERT_TIMEZONE=Asia/Jerusalem
```

### How It Works
The `whatsapp-alerter.ts` module uses the **same WhatsApp provider** configured for agents. It maintains a dedicated "system" WhatsApp sender (not tied to any agent) that sends pre-approved WhatsApp templates to the admin number. The alert manager deduplicates repeated alerts (same event type within 5 minutes) and batches low-severity alerts into digest messages.

---

## Documentation

The project ships with comprehensive documentation in the `docs/` directory:

| Document | Purpose |
|----------|---------|
| `README.md` | Quick start — clone, configure, run in 5 minutes. Includes prerequisites, env var setup, and first agent provisioning. |
| `SETUP.md` | Full setup guide covering: manual CLI setup, UI wizard setup, Docker deployment, provider selection, database migration, initial pool seeding, and admin alert configuration. |
| `API.md` | REST API reference — all webhook endpoints, admin endpoints, health checks, metrics. Auto-generated from the OpenAPI spec. |
| `MCP-TOOLS.md` | MCP tool reference — every tool with input/output schemas, examples, error codes, and rate limit behavior. Includes curl-equivalent examples for testing outside MCP clients. |
| `PROVIDERS.md` | Provider adapter guide — how to add a new provider, interface contracts, credential registration, and testing against mock providers. |
| `SECURITY.md` | Security architecture — threat model, attack surface analysis, token lifecycle, encryption details, hardening checklist, and incident response playbook. |
| `OBSERVABILITY.md` | Monitoring guide — Prometheus/Grafana setup, structured logging with ELK, audit log queries, admin alert tuning, and dashboard screenshots. |
| `TROUBLESHOOTING.md` | Common issues — provider connectivity failures, webhook not receiving, rate limit misconfigurations, WhatsApp pending review, voice latency issues. |
| `ARCHITECTURE.md` | System architecture — Mermaid diagrams for data flow, sequence diagrams for each use case (inbound call, outbound SMS, agent-to-agent call), and provider adapter class diagram. |
| `CHANGELOG.md` | Release notes — versioned changes, migration instructions between versions. |

### Documentation Standards
- All code examples in docs are **runnable** — they can be copied and executed as-is with a valid `.env`.
- Every MCP tool has at least one complete input/output example.
- API docs include error response examples for every error code.
- Setup instructions are tested on macOS, Linux (Ubuntu 24), and Docker.

---

## Swagger / API Explorer / Demo Testing

### OpenAPI Spec
The server generates a full **OpenAPI 3.1 specification** covering:
- All REST endpoints (webhooks, admin, health, metrics)
- All MCP tools (mapped to equivalent REST representations for testing)
- Request/response schemas with TypeScript types
- Authentication schemes (Bearer token for agents, Basic auth for admin)
- Error response models with all status codes

### Swagger UI
Available at `GET /admin/api-docs` — an interactive Swagger UI that lets the administrator (or developer):
- Browse all endpoints and tool schemas
- Send test requests directly from the browser
- See live response bodies, headers, and status codes
- Test authentication flows (enter token → test tool calls)
- View example payloads for every operation

### Demo / Sandbox Mode
The server supports a `DEMO_MODE=true` environment variable that:
- Uses **mock provider adapters** instead of real Twilio/SendGrid/ElevenLabs — no real calls, SMS, or emails are sent
- All actions return realistic-looking responses with simulated costs, latencies, and message IDs
- Provisioning creates fake phone numbers and email addresses
- Voice WebSocket handler responds with canned LLM responses
- Rate limiting, cost tracking, and usage dashboard still function normally (with fake costs)
- The Swagger UI shows a "DEMO MODE" banner so testers know nothing real is happening

This allows developers to integration-test their MCP client against the full server without incurring any provider costs or needing real credentials.

```bash
# Start in demo mode
DEMO_MODE=true npm start

# Swagger UI available at:
# http://localhost:3100/admin/api-docs

# Health check:
# http://localhost:3100/health
```

### Scenario Test Runner
The `tests/fixtures/scenario-runner.ts` provides end-to-end test scenarios that can be run in demo mode:
- **Scenario 1:** Provision agent → send SMS → receive inbound SMS → check usage dashboard
- **Scenario 2:** Provision agent → make outbound voice call → simulate conversation → check call log
- **Scenario 3:** Hit rate limit → verify blocking → check admin alert triggered
- **Scenario 4:** Simulate webhook replay attack → verify rejection
- **Scenario 5:** Agent-to-agent call → verify both agents' logs updated

---

## Setup UI Wizard

The server includes a web-based setup wizard served at `/admin/setup`. It provides a guided, no-CLI-required configuration experience.

### Setup Flow

**Step 1 — Welcome + Environment**
- Detect current environment (local dev, Docker, cloud)
- Pre-fill defaults based on environment
- Check Node.js version and dependencies

**Step 2 — Provider Selection**
- Visual picker for each provider slot (telephony, email, TTS, STT, database, storage)
- Each option shows: logo, pricing summary, feature highlights, "recommended" badge for defaults
- Selected providers highlighted — user can mix and match

**Step 3 — Credential Entry**
- Dynamic form based on selected providers (only shows fields for chosen providers)
- "Test Connection" button per provider — verifies credentials in real-time
- Green checkmark / red X with error details next to each provider
- Option to auto-register credentials via `comms_register_provider` in the background

**Step 4 — Agent Pool Configuration**
- Set initial pool size (default: 5)
- Configure default rate limits and spending caps
- Set admin WhatsApp number for alerts

**Step 5 — Database Migration**
- Shows migration status
- One-click "Run Migrations" button
- Displays table creation progress

**Step 6 — First Agent Provisioning**
- Provision a test agent to verify the full pipeline
- Shows live provisioning log (phone number assigned, email configured, etc.)
- Sends a test SMS to the admin's number as proof of life

**Step 7 — Summary + Launch**
- Shows all configured providers with status
- Shows admin alert configuration
- "Copy .env" button for manual deployments
- "Launch Server" button for local dev
- Links to documentation and Swagger UI

### Admin Dashboard (post-setup)
After initial setup, `/admin/dashboard` provides a live operational dashboard:
- Agent pool status (slots used / total, each agent's channel status)
- Real-time action feed (last 50 actions across all agents)
- Cost graph (daily/weekly/monthly, per agent or aggregate)
- Rate limit heatmap (which agents are hitting limits)
- Alert history (recent WhatsApp notifications sent to admin)
- Provider health status (green/yellow/red per provider)
- Quick actions: suspend agent, rotate token, adjust limits

---

## Build Order

1. **Phase 1 — Core plumbing + Security:** MCP server skeleton, provider factory, provider interfaces, database schema (with all tables including `audit_log`), agent registration + security token issuance, impersonation guard, input sanitizer, `comms_provision_channels`, `comms_deprovision_channels`, `comms_get_channel_status`, agent pool (5 slots)
2. **Phase 2 — Attack hardening:** DDoS protection middleware, IP allowlist, replay attack prevention, CORS/CSP headers, anomaly detector (foundation), brute-force lockout
3. **Phase 3 — Rate limiting + Cost tracking:** Rate limiter (sliding window), daily limits, spending caps, cost tracker, `comms_get_usage_dashboard`, `comms_set_agent_limits`, anti-harassment frequency tracking
4. **Phase 4 — Observability + Admin alerts:** Health checks, Prometheus metrics endpoint, structured logger, audit log (hash chain), alert manager, WhatsApp alerter to admin, `ADMIN_WHATSAPP_NUMBER` config
5. **Phase 5 — Messaging:** `comms_send_message` (SMS + email first), inbound webhooks (SMS + email), `comms_get_messages`, content filtering on outbound messages
6. **Phase 6 — Provider adapters (Telephony + Email):** Twilio adapter (default), SendGrid adapter (default), at least one alternative adapter per slot (e.g., Vonage for telephony, Resend for email), `comms_register_provider`, mock adapters for demo mode
7. **Phase 7 — WhatsApp:** WhatsApp sender registration, WhatsApp send/receive, number pool manager, template management
8. **Phase 8 — Voice:** Pre-recorded voice messages (`comms_send_voice_message`), TTS integration (ElevenLabs adapter + at least one alternative like WAPI), route duplication (live call + recording)
9. **Phase 9 — Live Voice AI:** Voice orchestration WebSocket handler, `comms_make_call`, `comms_transfer_call`, call logging, agent-to-agent voice calls
10. **Phase 10 — Swagger + API Explorer:** OpenAPI 3.1 spec generation, Swagger UI at `/admin/api-docs`, demo mode with mock providers, scenario test runner
11. **Phase 11 — Setup UI + Admin Dashboard:** Setup wizard (7-step flow), admin dashboard (live status, cost graphs, alert history), static asset serving
12. **Phase 12 — Documentation:** README, SETUP.md, API.md, MCP-TOOLS.md, PROVIDERS.md, SECURITY.md, OBSERVABILITY.md, TROUBLESHOOTING.md, ARCHITECTURE.md (with Mermaid diagrams)
13. **Phase 13 — Compliance + Final hardening:** DNC list checking, TCPA time-of-day enforcement, recording consent announcements, CAN-SPAM unsubscribe, webhook signature validation for all providers, comprehensive tests (security, rate limits, attack simulations, providers, channels, webhooks, observability), error handling, retry logic
14. **Phase 14 — Database + Storage provider adapters:** Convex adapter, Turso adapter, SQLite adapter (local dev), S3/R2 storage adapters
15. **Phase 15 — Polish:** Provider billing passthrough/tracking, spending alert fine-tuning, agent pool expansion tooling, documentation review, demo scenario coverage
