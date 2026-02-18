# MCP Tools Reference

All tools are called via the MCP protocol over SSE transport. Each tool requires authentication unless in demo mode.

## comms_ping

Health check / connectivity test.

**Input:**
- `message` (string, optional) — Echo message

**Output:**
```json
{
  "status": "ok",
  "server": "agentos-comms",
  "echo": "hello",
  "pool": { "maxAgents": 5, "activeAgents": 1, "slotsRemaining": 4 },
  "providers": { "telephony": "twilio", "email": "resend", "tts": "edge-tts" }
}
```

## comms_send_message

Send SMS, email, or WhatsApp message.

**Input:**
- `agentId` (string) — Agent ID
- `to` (string) — Recipient (E.164 phone or email)
- `body` (string) — Message text
- `channel` (enum: sms/email/whatsapp, default: sms)
- `subject` (string, optional) — Email subject (required for email)
- `html` (string, optional) — HTML body for email
- `templateId` (string, optional) — WhatsApp template SID
- `templateVars` (object, optional) — Template variables

**Output:**
```json
{
  "success": true,
  "messageId": "uuid",
  "externalId": "SMxxxxxx",
  "status": "queued",
  "cost": 0.0075,
  "channel": "sms",
  "from": "+15551234567",
  "to": "+15559876543"
}
```

**Compliance checks:** Content filter, DNC list, TCPA time-of-day (voice), CAN-SPAM (email).

## comms_make_call

Initiate outbound AI voice call. When connected, opens a live conversation.

**Input:**
- `agentId` (string) — Agent ID
- `to` (string) — Phone number in E.164
- `systemPrompt` (string, optional) — AI instructions for this call
- `greeting` (string, optional) — First thing AI says
- `voice` (string, optional) — TTS voice ID
- `language` (string, optional) — Language code

**Output:**
```json
{
  "success": true,
  "callSid": "CAxxxxxx",
  "sessionId": "uuid",
  "status": "queued",
  "from": "+15551234567",
  "to": "+15559876543"
}
```

**Compliance checks:** TCPA time-of-day, DNC list, content filter on greeting.

## comms_send_voice_message

Generate TTS audio and deliver via phone call.

**Input:**
- `agentId` (string) — Agent ID
- `to` (string) — Phone number in E.164
- `text` (string) — Text to speak
- `voice` (string, optional) — TTS voice ID

**Output:**
```json
{
  "success": true,
  "callSid": "CAxxxxxx",
  "audioUrl": "http://localhost:3100/storage/audio-uuid.mp3",
  "audioDurationMs": 3500
}
```

## comms_get_messages

Retrieve message history for an agent.

**Input:**
- `agentId` (string) — Agent ID
- `channel` (enum, optional) — Filter by channel
- `direction` (enum: inbound/outbound, optional) — Filter by direction
- `limit` (number, default: 50) — Max results
- `offset` (number, default: 0) — Pagination offset

**Output:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "channel": "sms",
      "direction": "outbound",
      "from": "+15551234567",
      "to": "+15559876543",
      "body": "Hello!",
      "status": "sent",
      "createdAt": "2026-02-15T12:00:00Z"
    }
  ],
  "total": 1
}
```

## comms_transfer_call

Transfer a live voice call to a human phone number or another agent.

**Input:**
- `agentId` (string) — Agent ID
- `callSid` (string) — Active call SID
- `to` (string) — Destination (phone number or agent ID)
- `announcementText` (string, optional) — Text to say before transfer

## comms_provision_channels

Provision phone/SMS/WhatsApp/email/voice for a new agent.

**Input:**
- `agentId` (string) — New agent ID
- `displayName` (string) — Display name
- `capabilities` (array) — Channels to provision: sms, voice, whatsapp, email
- `country` (string, optional) — Country code for phone number
- `emailDomain` (string, optional) — Custom email domain

**Output:** Provisioned channels with phone number, email address, WhatsApp sender, security token.

## comms_deprovision_channels

Tear down all channels for an agent. Releases phone number, returns WhatsApp pool slot.

**Input:**
- `agentId` (string) — Agent to deprovision

## comms_get_channel_status

Check provisioning and health status of all channels for an agent.

**Input:**
- `agentId` (string) — Agent ID

## comms_onboard_customer

Full automated onboarding: provisions all channels, generates DNS records, returns complete setup package.

**Input:**
- `agentId` (string) — Agent ID
- `displayName` (string) — Display name
- `capabilities` (array) — Channels to provision
- `emailDomain` (string, optional) — Custom email domain
- `greeting` (string, optional) — Voice greeting
- `systemPrompt` (string, optional) — Voice system prompt

**Output:** Security token, all channels, DNS records, webhook URLs, SSE connection instructions.

## comms_register_provider

Register or update third-party provider credentials. Admin only.

**Input:**
- `provider` (enum) — Provider name (twilio, vonage, resend, elevenlabs, openai, deepgram, s3, r2, turso, convex)
- `credentials` (object) — Provider-specific credential fields
- `verify` (boolean, default: true) — Test credentials before saving

## comms_set_agent_limits

Configure rate limits and spending caps. Admin only.

**Input:**
- `agentId` (string) — Agent to configure
- `limits` (object) — Partial update:
  - `maxActionsPerMinute` (number)
  - `maxActionsPerHour` (number)
  - `maxActionsPerDay` (number)
  - `maxSpendPerDay` (number)
  - `maxSpendPerMonth` (number)

## comms_get_usage_dashboard

Usage statistics, costs, and rate limits per agent.

**Input:**
- `agentId` (string, optional) — Specific agent (omit for all agents, admin only)
- `period` (enum: today/week/month/all, default: today)

## comms_get_billing_summary

Billing summary with provider costs, markup, and billed costs.

**Input:**
- `agentId` (string, optional) — Specific agent (omit for all agents, admin only)
- `period` (enum: today/week/month/all, default: month)

**Output:**
```json
{
  "providerCost": 12.50,
  "billingCost": 15.00,
  "markupPercent": 20,
  "tier": "pro",
  "byChannel": {
    "sms": { "providerCost": 7.50, "billingCost": 9.00, "count": 100 },
    "voice": { "providerCost": 5.00, "billingCost": 6.00, "count": 10 }
  }
}
```

## comms_set_billing_config

Set billing tier, markup percentage, and billing email for an agent. Admin only.

**Input:**
- `agentId` (string) — Agent to configure
- `tier` (enum: free/starter/pro/enterprise, optional)
- `markupPercent` (number 0-500, optional)
- `billingEmail` (string, optional)

**Tier limits:**

| Tier | Actions/min | Actions/day | Spend/month |
|------|-------------|-------------|-------------|
| Free | 5 | 100 | $10 |
| Starter | 10 | 500 | $100 |
| Pro | 30 | 5,000 | $1,000 |
| Enterprise | 100 | 50,000 | $50,000 |

## comms_record_consent

Record that a contact has given consent to be contacted on a specific channel.

**Input:**
- `agentId` (string) — Agent ID this consent applies to
- `contactAddress` (string) — Phone number or email
- `channel` (enum: sms/voice/email/whatsapp) — Channel
- `consentType` (enum: express/implied/transactional, default: express) — Type of consent
- `source` (string, optional) — How consent was obtained (web_form, verbal, sms_optin, api)
- `notes` (string, optional) — Additional context

**Output:**
```json
{
  "success": true,
  "consentId": "uuid",
  "status": "granted"
}
```

## comms_revoke_consent

Record that a contact has revoked consent for a channel.

**Input:**
- `agentId` (string) — Agent ID
- `contactAddress` (string) — Phone number or email
- `channel` (enum: sms/voice/email/whatsapp) — Channel

**Output:**
```json
{
  "success": true,
  "status": "revoked"
}
```

## comms_check_consent

Check current consent status for a contact/channel.

**Input:**
- `agentId` (string) — Agent ID
- `contactAddress` (string) — Phone number or email
- `channel` (enum: sms/voice/email/whatsapp) — Channel

**Output:**
```json
{
  "hasConsent": true,
  "status": "granted",
  "consentType": "express",
  "grantedAt": "2026-02-18T12:00:00Z",
  "source": "web_form"
}
```
