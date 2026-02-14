<!-- version: 1.0 | updated: 2026-02-12 -->
<!-- Source: Claude artifact - AgentOS Communication Architecture -->

# AgentOS Dynamic Communication Stack Architecture

Architecture guide for dynamically provisioning phone calls, SMS, email, WhatsApp per-agent with full in/out capabilities.

---

## Executive Summary

Build a dynamic communication layer that spins up a full identity (phone, SMS, WhatsApp, email, voice) per AI agent and tears it down on decommission. Multi-tenant CPaaS orchestration.

**Recommendation:** Twilio as single-platform stack (Voice + SMS + WhatsApp + SendGrid email) — only provider offering programmatic subaccount creation, phone number purchase, WhatsApp sender registration, and unified conversation threading via API.

**Critical constraint:** WhatsApp. Phone/SMS/voice/email provision in seconds. WhatsApp requires Meta business verification (one-time, 5-20 days) and sender name review per number (minutes to hours). Needs pooling/session-routing strategy.

**Estimated base cost:** ~$3-5/agent/month for dedicated identity, or dramatically less with shared pool.

---

## 7 Key Architecture Decisions

### 1. Identity Model: Dedicated vs Shared

- **Shared Pool + Routing (recommended for scale)** — 1000s of agents on 10-50 numbers
- **Dedicated per Agent** — premium, $3-5/mo each
- **Hybrid** — shared default, dedicated upgrade

### 2. WhatsApp Strategy

- **Pre-provisioned Sender Pool** — allocate on agent create (start here)
- **Single Number + Session Routing** — cheapest, 1 number for all
- **ISV Tech Provider Program** — bulk API registration, 100+ agents

Start with pool of 10-50 pre-registered senders. Migrate to ISV at scale.

### 3. Tenant Isolation

- **Subaccount per Agent** — hard isolation, up to 1,000
- **Subaccount per Tenant/Customer** — agents share within (sweet spot for SMB SaaS)
- **Single Account + DB Routing** — simplest, no isolation

### 4. Voice Architecture

- **Live AI Voice** — real-time TTS+STT (complex)
- **Voicemail/Recording -> Async** — simpler, start here
- **Both** — IVR routes

### 5. Conversation Threading

- **Unified (Twilio Conversations API)** — WA+SMS+Chat in 1 thread (recommended)
- **Per-Channel** — simpler, separate contexts

### 6. Cost Model

- **Pass-Through + Markup**
- **Bundled into Tiers** — simplest for SMBs
- **Hybrid** — base bundle + overage

### 7. Media Handling

- **Download + Store in S3/R2** — recommended, Twilio media URLs expire
- **Twilio Media URLs** — temporary, simpler

---

## Provisioning Flow

1. **Create Twilio Subaccount** (~1s)
2. **Buy Phone Number** with voice+SMS (~2-5s, instant)
3. **Configure Voice** — TwiML apps (~1s)
4. **Register WhatsApp Sender** — Senders API (~minutes to hours, Meta review)
5. **Provision Email Identity** — SendGrid/Resend (~instant if domain pre-verified)
6. **Store Channel Mapping in DB** (~instant)

---

## Critical Constraints

- WhatsApp is the bottleneck (Meta verification + sender name review)
- WhatsApp 24h window — templates only outside it
- ISV/Tech Provider path for bulk WhatsApp registration
- US SMS requires A2P 10DLC (1-2 week first approval)
- Call recording consent (two-party consent jurisdictions)
- Twilio subaccounts max 1,000 (can request more)

---

## Channel Capabilities Matrix

| Capability | Phone Call | SMS/MMS | WhatsApp | Email |
|------------|-----------|---------|----------|-------|
| Text | — | Yes (160/SMS) | Yes (4,096) | Yes (unlimited) |
| Voice | Native | No | Audio files | Attachment |
| Images | — | MMS | Yes (5MB) | Inline+attach |
| Files | — | MMS (limited) | Yes (100MB) | Yes (25MB) |
| Inbound | Webhook | Webhook | Webhook | Inbound Parse |
| Outbound | API call | API send | Templates outside 24h | API send |
| Provisioning Speed | Seconds | Seconds | Min-Hours | Instant |
| Rich/Interactive | IVR, DTMF, TTS | Basic | Buttons, lists, catalogs | Full HTML |

---

## Provider Comparison

### Twilio (All-in-One) — Recommended

Only platform where ALL 4 channels + dynamic provisioning + multi-tenancy work under one API. Conversations API unifies threads across channels.

### Infobip + SendGrid

Better out-of-the-box automation, less granular dynamic provisioning.

### Vonage + Resend

Cheaper voice (per-second billing), great email DX. Weaker multi-tenant provisioning.

---

## Provisioning Pseudocode

```typescript
async function provisionAgentComms(agentId, config) {
  // 1. Create isolated subaccount
  const subaccount = await twilio.api.accounts.create({
    friendlyName: `agent-${agentId}`
  });

  // 2. Buy phone number with voice + SMS
  const phone = await twilio.api.accounts(subaccount.sid)
    .incomingPhoneNumbers.create({
      phoneNumber: '+1...',
      voiceUrl: `https://api.yourdomain.com/agents/${agentId}/voice`,
      smsUrl: `https://api.yourdomain.com/agents/${agentId}/sms`,
    });

  // 3. Register WhatsApp sender
  const whatsapp = await twilio.messaging.v2.channels.senders.create({
    senderId: `whatsapp:${phone.phoneNumber}`,
    profile: { name: config.displayName, about: config.description },
    configuration: {
      webhooks: { postUrl: `https://api.yourdomain.com/agents/${agentId}/whatsapp` }
    }
  });

  // 4. Email via SendGrid domain (pre-verified)
  const email = `${agentId}@agents.yourdomain.com`;

  // 5. Store channel mapping
  await db.agentChannels.upsert({
    agentId,
    subaccountSid: subaccount.sid,
    phone: phone.phoneNumber,
    whatsappSender: whatsapp.sid,
    email,
    status: 'active',
  });

  return { phone: phone.phoneNumber, whatsapp: phone.phoneNumber, email };
}
```

---

## Inbound Webhook Router

```typescript
app.post('/agents/:agentId/:channel', async (req, res) => {
  const { agentId, channel } = req.params;
  const message = {
    channel,
    from: req.body.From,
    body: req.body.Body,
    media: req.body.MediaUrl0 || null,
    numMedia: req.body.NumMedia || 0,
  };

  await agentOrchestrator.handleInbound(agentId, message);

  if (channel === 'voice') {
    res.type('text/xml').send(`<Response><Say>${agentGreeting}</Say><Record/></Response>`);
  } else {
    res.sendStatus(200);
  }
});
```

---

## Recommended Stack

| Channel | Provider | Dynamic? | Cost |
|---------|----------|----------|------|
| Phone (In/Out) | Twilio Voice | Instant | ~$1/mo/number + $0.014/min |
| SMS (In/Out) | Twilio Messaging | Instant | ~$0.0079/msg |
| WhatsApp (In/Out) | Twilio WhatsApp Business | Min-Hours | Meta conv. fees + ~$0.005/msg |
| Email (In/Out) | SendGrid | Instant | Free 100/day, then $19.95/mo |
| Unified Conversations | Twilio Conversations API | Instant | Included |
| Multi-Tenancy | Twilio Subaccounts | Instant | Free |

---

## Key Insight

Twilio is the only platform where you can programmatically create a tenant (subaccount), buy a number, register it for WhatsApp, configure voice webhooks, and track per-agent billing — all through a single API. Start with Strategy B (shared pool + routing), upgrade high-value agents to dedicated identity as needed.
