# Provider Adapter Guide

The server uses a pluggable provider architecture. Every external dependency has an abstract interface. Providers are swappable via configuration.

## Provider Slots

| Slot | Interface | Default | Alternatives |
|------|-----------|---------|--------------|
| Telephony | `ITelephonyProvider` | Twilio | Vonage |
| Email | `IEmailProvider` | Resend | — |
| WhatsApp | `IWhatsAppProvider` | Twilio | — |
| TTS | `ITTSProvider` | Edge TTS (free) | ElevenLabs, OpenAI |
| STT | `ISTTProvider` | Deepgram | — |
| Voice | `IVoiceOrchestrator` | ConversationRelay | — |
| Database | `IDBProvider` | SQLite | Turso, Convex |
| Storage | `IStorageProvider` | Local filesystem | S3, R2 |

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

## Available Adapters

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
