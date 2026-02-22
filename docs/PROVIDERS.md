<!-- version: 1.1 | updated: 2026-02-22 -->

# Provider Adapter Guide

The server uses a pluggable provider architecture. Every external dependency has an abstract interface. Providers are swappable via configuration.

## Provider Slots

| Slot | Interface | Default | Implemented | Alternatives |
|------|-----------|---------|-------------|--------------|
| Telephony | `ITelephonyProvider` | Twilio | Twilio, Vonage | Telnyx, Plivo, Bandwidth |
| Email | `IEmailProvider` | Resend | Resend | Postmark, Amazon SES, Mailgun |
| WhatsApp | `IWhatsAppProvider` | Twilio | Twilio | Meta Cloud API, Gupshup, Infobip |
| TTS | `ITTSProvider` | Edge TTS (free) | Edge TTS, ElevenLabs, OpenAI | Cartesia, PlayHT, Amazon Polly |
| STT | `ISTTProvider` | Deepgram | Deepgram | AssemblyAI, Speechmatics, Rev.ai |
| Voice | `IVoiceOrchestrator` | ConversationRelay | ConversationRelay | — |
| Database | `IDBProvider` | SQLite | SQLite, Turso, Convex | Neon, Supabase, CockroachDB |
| Storage | `IStorageProvider` | Local filesystem | Local, S3, R2 | Backblaze B2, DigitalOcean Spaces, MinIO |

## Selection

Providers are selected via environment variables:

```env
PROVIDER_TELEPHONY=twilio       # twilio | vonage
PROVIDER_EMAIL=resend
PROVIDER_TTS=edge-tts           # edge-tts | elevenlabs | openai
PROVIDER_STT=deepgram
PROVIDER_DATABASE=sqlite        # sqlite | turso | convex
PROVIDER_STORAGE=local          # local | s3 | r2
```

In demo mode (`DEMO_MODE=true`), all providers automatically use mock adapters.

## Interfaces

### ITelephonyProvider
```typescript
sendSms(params: { from, to, body }): Promise<{ messageId, status, cost }>
makeCall(params: { from, to, webhookUrl }): Promise<{ callSid, status }>
transferCall(params: { callSid, to, announcementText? }): Promise<{ status }>
buyNumber(params: { country, areaCode? }): Promise<{ phoneNumber, sid }>
releaseNumber(sid: string): Promise<void>
configureWebhooks(params: { phoneNumber, smsUrl, voiceUrl }): Promise<void>
verifyWebhookSignature(params): boolean
```

### IEmailProvider
```typescript
send(params: { from, to, subject, body, html? }): Promise<{ messageId, status, cost }>
verifyDomain?(domain: string): Promise<{ records }>
```

### IWhatsAppProvider
```typescript
send(params: { from, to, body, templateId?, templateVars? }): Promise<{ messageId, status, cost }>
```

### ITTSProvider
```typescript
synthesize(text: string, options?: { voice?, language? }): Promise<{ audio: Buffer, durationMs, format }>
```

### ISTTProvider
```typescript
transcribe(audio: Buffer, options?: { language?, model? }): Promise<{ text, confidence, language }>
```

### IDBProvider
```typescript
query<T>(sql: string, params?: unknown[]): T[]
run(sql: string, params?: unknown[]): { changes: number }
exec(sql: string): void
close(): void
```

### IStorageProvider
```typescript
upload(key: string, data: Buffer, contentType: string): Promise<{ url, key }>
download(key: string): Promise<Buffer>
delete(key: string): Promise<void>
getPublicUrl(key: string): string
```

## Adding a New Provider

1. Create adapter file in `src/providers/` (e.g., `telephony-plivo.ts`)
2. Implement the relevant interface
3. Add selection logic in `src/providers/factory.ts`
4. Add config fields in `src/lib/config.ts`
5. Add to `comms_register_provider` enum in `src/tools/register-provider.ts`

## Implemented Adapters

### Telephony
- **Twilio** (`telephony-twilio.ts`) — Full implementation: SMS, calls, transfers, number management
- **Vonage** (`telephony-vonage.ts`) — Full implementation via Nexmo REST APIs
- **Mock** (`telephony-mock.ts`) — Simulated responses for demo/dev

### Email
- **Resend** (`email-resend.ts`) — Send + domain verification via REST
- **Mock** (`email-mock.ts`) — Simulated responses

### TTS
- **Edge TTS** (`tts-edge.ts`) — Free Microsoft TTS, no API key needed
- **ElevenLabs** (`tts-elevenlabs.ts`) — Premium voices via API
- **OpenAI** (`tts-openai.ts`) — OpenAI TTS via `/v1/audio/speech`
- **Mock** (`tts-mock.ts`) — Returns silent WAV

### STT
- **Deepgram** (`stt-deepgram.ts`) — HTTP POST to `/v1/listen`
- **Mock** (`stt-mock.ts`) — Returns fixed transcription

### Database
- **SQLite** (`db/client.ts`) — Local file, zero setup
- **Turso** (`db-turso.ts`) — libSQL HTTP pipeline
- **Convex** (`db-convex.ts`) — REST-based (stub)

### Storage
- **Local** (`storage-local.ts`) — Filesystem + Express static route
- **S3** (`storage-s3.ts`) — AWS S3 with Signature V4
- **R2** (`storage-r2.ts`) — Cloudflare R2 (wraps S3 adapter)

---

## Alternative Providers (Not Yet Implemented)

The following providers can be added as adapters. Each implements the same interface as existing adapters.

### Telephony Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Telnyx** | Owns its own IP network — sub-200ms latency, 24/7 free support | SMS: $0.0025/msg outbound (inbound free). Voice: pay-per-minute | REST + SDKs (Node, Python, Ruby, PHP, .NET, Java) |
| **Plivo** | Developer-focused, transparent pricing, 190+ countries | SMS: ~$0.005/msg. Voice: from $0.050/min. $5 free trial credit | REST + SDKs (Node, Python, Ruby, PHP, Java, Go, .NET) |
| **Bandwidth** | Tier-1 US carrier, no middlemen — best quality/price for US traffic | SMS: $0.004/msg (10DLC). Voice: $0.0055/min inbound | REST + SDKs (Node, Python, Ruby, PHP, Java, C#) |

### Email Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Postmark** | 22% better inbox placement than SendGrid in independent tests | Free: 100 emails/mo. Paid: $15/mo for 10K emails | REST + SMTP + SDKs |
| **Amazon SES** | Cheapest at scale — unbeatable per-email cost | $0.10 per 1,000 emails. Free: 3,000/mo (12 months) | REST + SMTP + AWS SDKs |
| **Mailgun** | Strong deliverability analytics and flexible routing rules | From $0.80 per 1,000 emails. Trial: 100 emails/day | REST + SMTP + SDKs |

### WhatsApp Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Meta Cloud API** | Zero markup, direct from Meta, first access to new features | Meta's per-message rates only (~$0.005-$0.06 by country) | REST (Graph API) |
| **Gupshup** | Early access to WhatsApp features, strong in India/emerging markets | Meta fees + $0.001/msg platform fee | REST + SDKs + bot builder |
| **Infobip** | Enterprise omnichannel — WhatsApp + SMS + email + voice in one platform | Meta fees + Infobip markup (enterprise pricing) | REST + SDKs + dashboard |

### TTS Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Cartesia (Sonic-3)** | Ultra-low latency (40-90ms TTFA) — ideal for real-time voice agents | Free: 10K credits. Pro: $5/mo. ~$0.03/min | REST + WebSocket streaming + SDKs |
| **PlayHT** | 900+ voices, good all-rounder with voice cloning | Free: 12,500 chars/mo. Creator: $39/mo (50K words) | REST + WebSocket streaming + SDKs |
| **Amazon Polly** | Predictable pay-per-character, 60+ languages, Neural + Standard | Free: 5M chars/mo Standard + 1M Neural (12mo). Then $4-$16/1M chars | REST + AWS SDKs |

### STT Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **AssemblyAI** | Best accuracy (Universal-2), built-in NLP (summarization, sentiment) | Free: $50 credit (~185hrs). Then $0.15/hr | REST + WebSocket + SDKs (Node, Python) |
| **Speechmatics** | Deployment flexibility — cloud, on-prem, or edge. 50+ languages | Free: 8 hrs/mo + 2 real-time streams | REST + WebSocket + SDKs |
| **Rev.ai** | Lowest entry-level pricing, battle-tested on millions of hours | $0.002/min standard. Reverb Turbo: $0.10/hr | REST + WebSocket + SDKs |

### Database Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Neon** | Serverless Postgres with git-like branching and scale-to-zero | Free: 100 projects, 0.5GB/branch. Paid: from $19/mo | Postgres wire + REST + serverless driver |
| **Supabase** | Full stack — Postgres + Auth + Storage + Realtime + Edge Functions | Free: 500MB DB, 1GB storage, 50K MAUs. Pro: $25/mo | REST + Realtime WS + Postgres wire + SDKs |
| **CockroachDB** | Distributed SQL, auto-sharding, survives zone failures | Free: $15/mo credit ($400 signup bonus). 10GB included | Postgres wire + REST + SDKs |

### Object Storage Alternatives

| Provider | Key Advantage | Pricing | API |
|----------|---------------|---------|-----|
| **Backblaze B2** | 1/5th the cost of S3, free egress up to 3x storage | Free: 10GB + 10GB egress/day. Storage: $0.006/GB-mo | S3-compatible + native REST |
| **DigitalOcean Spaces** | Flat $5/mo all-in, CDN included, no surprise bills | $5/mo: 250GB storage + 1TB outbound | S3-compatible + CLI |
| **MinIO** | Open-source self-hosted S3, sub-10ms latency, no vendor lock-in | Free (AGPL v3). Enterprise support: custom | S3-compatible + REST + SDKs |
