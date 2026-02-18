<!-- version: 1.0 | updated: 2026-02-18 -->

# Channel Setup Guide

Complete setup guide for all communication channels — inbound, outbound, and two-way messaging.

---

## SMS

### What You Need
- Twilio account with Account SID and Auth Token
- A phone number with SMS capability (purchased via Twilio or provisioned through the API)
- For US: A2P 10DLC campaign registration (required for business messaging)

### Outbound SMS
1. **Provision an agent** — the agent gets a phone number automatically
2. **Send via MCP tool:**
   ```json
   {
     "tool": "comms_send_message",
     "params": {
       "agentId": "my-agent",
       "to": "+15559876543",
       "body": "Hello from your AI agent!",
       "channel": "sms"
     }
   }
   ```
3. **Or via REST API:**
   ```bash
   curl -X POST http://your-server/api/v1/send-message \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"agentId":"my-agent","to":"+15559876543","body":"Hello!","channel":"sms"}'
   ```

### Inbound SMS
1. **Webhook URL:** `https://your-server/webhooks/<agentId>/sms`
2. **Auto-configured** during provisioning — the server sets Twilio webhook URLs automatically
3. **Manual setup:** In Twilio Console → Phone Numbers → Your Number → Messaging → Webhook URL
4. Inbound messages are stored in the database and forwarded to the connected agent

### Two-Way Threading
- The system tracks conversations by phone number
- Use `comms_get_messages` with `contactAddress` to get full thread history
- STOP keyword processing: recipient texts STOP → consent revoked + added to DNC list

### A2P 10DLC (US Only)
Required for business SMS in the US:
1. Register your brand with The Campaign Registry (TCR)
2. Submit a campaign describing your use case
3. Link your Twilio Messaging Service to the approved campaign
4. Set `TWILIO_MESSAGING_SERVICE_SID` in your environment

---

## Voice

### What You Need
- Twilio account with voice-enabled phone number
- Public webhook URL (HTTPS required for WebSocket upgrade)
- Optional: ElevenLabs or OpenAI API key for premium TTS

### Outbound Calls
```json
{
  "tool": "comms_make_call",
  "params": {
    "agentId": "my-agent",
    "to": "+15559876543",
    "greeting": "Hello, this is your appointment reminder.",
    "systemPrompt": "You are a friendly appointment assistant."
  }
}
```

The call connects, plays the greeting, then opens a live two-way AI conversation.

### Inbound Calls
1. **Webhook URL:** `https://your-server/webhooks/<agentId>/voice`
2. **Auto-configured** during provisioning
3. **Flow:**
   - Twilio sends call to your webhook
   - Server returns ConversationRelay TwiML
   - Twilio opens WebSocket for real-time voice
   - Caller's speech → STT (by Twilio) → text to your AI agent
   - Agent responds → text to Twilio → TTS → caller hears

### Answering Machine
When the AI agent is not connected (8-second timeout):
- Built-in Claude acts as voicemail, collecting caller's message and preferences
- Requires `ANTHROPIC_API_KEY` in environment
- Voicemails dispatched when agent reconnects

### Call Transfer
```json
{
  "tool": "comms_transfer_call",
  "params": {
    "agentId": "my-agent",
    "callSid": "CAxxxxxxxx",
    "to": "+15551234567",
    "announcementText": "Connecting you to a human agent."
  }
}
```

### Voice Configuration
```env
VOICE_DEFAULT_GREETING="Hello, how can I help you today?"
VOICE_DEFAULT_VOICE=EXAVITQu4vr4xnSDxMaL
VOICE_DEFAULT_LANGUAGE=en-US
PROVIDER_TTS=edge-tts          # edge-tts | elevenlabs | openai
```

### Status Callbacks
- **Webhook URL:** `https://your-server/webhooks/<agentId>/voice/status`
- Receives call status updates (initiated, ringing, answered, completed)
- Duration and cost logged to `call_logs` table

---

## Email

### What You Need
- Resend account with API key
- Verified domain with DNS records

### Domain Verification
1. Sign up at [resend.com](https://resend.com)
2. Add your domain in Resend dashboard
3. Add DNS records:
   - **SPF:** TXT record — `v=spf1 include:amazonses.com ~all`
   - **DKIM:** CNAME records (provided by Resend)
   - **DMARC:** TXT record — `v=DMARC1; p=none`
4. Wait for verification (usually minutes, sometimes hours)
5. Set `RESEND_API_KEY` and `EMAIL_DEFAULT_DOMAIN` in environment

### Outbound Email
```json
{
  "tool": "comms_send_message",
  "params": {
    "agentId": "my-agent",
    "to": "user@example.com",
    "body": "Plain text body",
    "channel": "email",
    "subject": "Your appointment reminder",
    "html": "<h1>Reminder</h1><p>Your appointment is tomorrow.</p>"
  }
}
```

### Inbound Email
1. **Webhook URL:** `https://your-server/webhooks/<agentId>/email`
2. Configure in Resend dashboard → Webhooks → Add endpoint
3. Resend sends inbound emails as webhook POST with Svix signature
4. Server validates signature, stores metadata, forwards to agent

### Compliance
- CAN-SPAM: System warns if outbound emails lack unsubscribe mechanism
- Content filtering applies to email body

---

## WhatsApp

### What You Need
- Twilio account with WhatsApp sender configured
- WhatsApp Business profile approved by Meta
- For development: Twilio WhatsApp Sandbox

### Setup
1. **Twilio Console** → Messaging → WhatsApp Senders
2. **Development:** Use Twilio WhatsApp Sandbox (instant, for testing)
3. **Production:** Register a WhatsApp Business sender (requires Meta approval)

### Outbound WhatsApp
```json
{
  "tool": "comms_send_message",
  "params": {
    "agentId": "my-agent",
    "to": "+15559876543",
    "body": "Hello via WhatsApp!",
    "channel": "whatsapp"
  }
}
```

### Template Messages
WhatsApp requires pre-approved templates for messages outside the 24-hour conversation window:
```json
{
  "tool": "comms_send_message",
  "params": {
    "agentId": "my-agent",
    "to": "+15559876543",
    "channel": "whatsapp",
    "templateId": "HXb5b62575e6e4ff6129ad7c8efe1f983e",
    "templateVars": { "1": "John", "2": "tomorrow at 3 PM" }
  }
}
```

### Inbound WhatsApp
1. **Webhook URL:** `https://your-server/webhooks/<agentId>/whatsapp`
2. **Auto-configured** during provisioning if WhatsApp sender is assigned
3. Messages within the 24-hour window allow free-form responses

### WhatsApp Pool
- WhatsApp senders are managed in a shared pool (`whatsapp_pool` table)
- Agents are assigned senders from the pool during provisioning
- Released back to pool on deprovisioning

---

## LINE

### What You Need
- LINE Developers account
- LINE Messaging API channel

### Setup
1. Create a provider at [developers.line.biz](https://developers.line.biz)
2. Create a Messaging API channel
3. Get the Channel Access Token and Channel Secret
4. Set webhook URL: `https://your-server/webhooks/<agentId>/line`

### Outbound LINE
```json
{
  "tool": "comms_send_message",
  "params": {
    "agentId": "my-agent",
    "to": "U1234567890abcdef",
    "body": "Hello via LINE!",
    "channel": "line"
  }
}
```

### Inbound LINE
1. **Webhook URL:** `https://your-server/webhooks/<agentId>/line`
2. Enable webhook in LINE Developers Console
3. Signature validation using Channel Secret

---

## Webhook URL Reference

All webhook URLs follow the pattern: `https://<WEBHOOK_BASE_URL>/webhooks/<agentId>/<channel>`

| Channel | Webhook Path | Provider |
|---------|-------------|----------|
| SMS | `/webhooks/:agentId/sms` | Twilio |
| Voice (inbound) | `/webhooks/:agentId/voice` | Twilio |
| Voice (outbound) | `/webhooks/:agentId/outbound-voice` | Twilio |
| Voice (status) | `/webhooks/:agentId/voice/status` | Twilio |
| Voice (WebSocket) | `/webhooks/:agentId/voice-ws` | Twilio |
| Email | `/webhooks/:agentId/email` | Resend |
| WhatsApp | `/webhooks/:agentId/whatsapp` | Twilio |
| LINE | `/webhooks/:agentId/line` | LINE |

### Setting WEBHOOK_BASE_URL

```env
# Development (with ngrok)
WEBHOOK_BASE_URL=https://abc123.ngrok.io

# Production
WEBHOOK_BASE_URL=https://your-domain.com
```

The webhook URL must be publicly accessible and use HTTPS (required by Twilio for voice WebSocket).

---

## Number Pool & Smart Routing

The server maintains a phone number pool for outbound routing:

- **Same-country routing:** If the pool has a number in the recipient's country, it's used automatically
- **Default number:** Falls back to the default pool number
- **Agent fallback:** If no pool number matches, uses the agent's own number

Pool numbers are seeded in the database and managed via admin tools.

---

## Compliance Checks

All outbound communications pass through compliance checks:

| Check | Channels | Description |
|-------|----------|-------------|
| Content Filter | All | Blocks threats, profanity, hate speech |
| DNC List | SMS, Voice, WhatsApp | Checked before every outbound action |
| TCPA | Voice | No calls before 8 AM or after 9 PM local time |
| CAN-SPAM | Email | Warns if emails lack unsubscribe |
| Consent | All | Checks `contact_consent` table if consent tracking is enabled |
| Recording Consent | Voice | Announces recording in two-party consent states |
