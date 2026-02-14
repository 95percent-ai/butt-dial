<!-- version: 1.0 | updated: 2026-02-12 -->
<!-- Source: C:\Users\inon\Downloads\ai_voice_agent_phone_architecture.html -->

# AI Voice Agent via Phone — Architecture Guide

Two use cases: sending a pre-generated voice recording to a phone, and live 2-way real-time conversation between an LLM-powered AI agent and a human caller.

---

## Use Case A: One-Way Voice Message (Simpler)

AI generates a voice recording (via ElevenLabs TTS), then Twilio places an outbound call and plays that audio to the human. No real-time interaction — like a voicemail or announcement.

- Generate audio file with ElevenLabs TTS API
- Twilio makes outbound call via REST API
- TwiML `<Play>` streams the audio file
- Optionally record human's response

**Latency:** None (pre-generated). **Complexity:** Low. **Best for:** Notifications, reminders, appointment confirmations.

---

## Use Case B: Live 2-Way Conversation (The Big One)

Human calls (or is called by) a phone number. An LLM-powered voice agent converses in real-time with sub-second latency. Full duplex with interruption handling.

- Twilio handles telephony (PSTN <-> WebSocket)
- STT converts caller speech -> text in real-time
- LLM processes text -> generates response
- TTS (ElevenLabs) converts response -> speech
- Audio streams back to caller in real-time

**Latency:** ~500ms-1s end-to-end. **Complexity:** Medium-High.

---

## Three Architecture Options for Live Voice

### Option 1: ConversationRelay (Recommended)

Twilio's managed orchestration layer. Handles STT, TTS, interruption management, and WebSocket plumbing. You just provide the LLM logic.

- Twilio manages STT + TTS + orchestration
- You receive **text** via WebSocket
- You send **text** back, Twilio speaks it
- Built-in interruption handling
- ElevenLabs voices with 75ms model latency
- p50 ~491ms, p95 ~713ms end-to-end

**Best for:** Production deployments. Least code, lowest latency, managed infra.

### Option 2: Media Streams + Custom (DIY)

Twilio streams raw audio via WebSocket. You handle STT, LLM, TTS, and orchestration yourself.

- Twilio sends raw mu-law 8kHz audio
- You pipe audio to STT (Deepgram/Whisper)
- You send text to LLM
- You send LLM output to TTS
- You pipe audio back through WebSocket
- You handle interruptions, buffering, etc.

**Best for:** Full control. More complex but swap any provider anytime.

### Option 3: ElevenLabs Native

Import Twilio number into ElevenLabs. They handle STT + LLM + TTS + orchestration.

**Best for:** Fastest path. Least control over LLM behavior.

---

## Comparison Table

| Parameter | ConversationRelay | Media Streams DIY | ElevenLabs Native |
|-----------|------------------|-------------------|-------------------|
| You handle | LLM logic only | STT+LLM+TTS+orch | Agent config only |
| Audio format | Text in/out (WS) | Raw mu-law 8kHz | Abstracted |
| STT Provider | Deepgram, Google, Amazon | You choose | ElevenLabs built-in |
| TTS Provider | ElevenLabs, Google, Amazon | You choose | ElevenLabs only |
| LLM | Bring your own | Bring your own | ElevenLabs agent (limited) |
| Interruption | Built-in | You build it | Built-in |
| Latency | p50 ~491ms, p95 ~713ms | Depends on stack | Sub-second (claimed) |
| Transfer to human | Action URL | You build it | Yes |
| Setup complexity | Low | High | Very Low |
| Cost (voice) | $0.07/min CR + Twilio | Twilio + your STT/TTS | ElevenLabs + Twilio |

---

## Data Flow: ConversationRelay

```
Human                   Twilio                        Your Server               LLM
  |                       |                              |                        |
  | Dials phone number    |                              |                        |
  |--------------------->|                              |                        |
  |                       | POST /incoming-call          |                        |
  |                       |---------------------------->|                        |
  |                       |                              |                        |
  |                       | TwiML: <Connect>             |                        |
  |                       |   <ConversationRelay         |                        |
  |                       |     url="wss://you/ws"       |                        |
  |                       |     ttsProvider="ElevenLabs"  |                        |
  |                       |     voice="Amelia" />         |                        |
  |                       |<----------------------------|                        |
  |                       |                              |                        |
  |                       | WebSocket established        |                        |
  |                       |===========================>|                        |
  |                       |                              |                        |
  |                       | "Hi! How can I help?"       |                        |
  | Hears greeting        |<- - - - - - - - - - - - - -| (welcomeGreeting)      |
  |                       |                              |                        |
  | "I need to..."        |                              |                        |
  |--------------------->|                              |                        |
  |                       | STT: speech -> text          |                        |
  |                       | { "type": "prompt",          |                        |
  |                       |   "voicePrompt": "I need.."}|                        |
  |                       |---------------------------->|                        |
  |                       |                              | Send to LLM            |
  |                       |                              |---------------------->|
  |                       |                              | Streaming response     |
  |                       |                              |<- - - - - - - - - - - |
  |                       | { "type": "text",            |                        |
  |                       |   "token": "Sure, I can..." }|                       |
  |                       |<----------------------------|  Stream tokens back    |
  |                       | TTS: text -> ElevenLabs      |                        |
  | Hears AI response     |<- - - - - - - - - - - - - -|                        |
  |                       |                              |                        |
  | [Interrupts!]         |                              |                        |
  |--------------------->|                              |                        |
  |                       | Detects interruption         |                        |
  |                       | { "type": "interrupt" }      |                        |
  |                       |---------------------------->| Cancel current gen     |
```

---

## Code: Use Case A — One-Way Voice Message

```typescript
// 1. Generate voice audio with ElevenLabs
const audioBuffer = await elevenlabs.textToSpeech.convert("Amelia", {
  text: "Hi Sarah, this is a reminder about your appointment tomorrow at 3 PM.",
  model_id: "eleven_turbo_v2_5",
  output_format: "ulaw_8000",  // Twilio-compatible format
});

// 2. Save to accessible URL
const audioUrl = await storage.upload(audioBuffer, `recordings/${agentId}/msg.wav`);

// 3. Twilio makes outbound call and plays the audio
const call = await twilio.calls.create({
  to: "+1234567890",
  from: agentPhoneNumber,
  twiml: `<Response>
    <Play>${audioUrl}</Play>
    <Record maxLength="120" action="/agents/${agentId}/recording-complete" />
  </Response>`,
});
```

---

## Code: Use Case B — Live Conversation (ConversationRelay)

```typescript
// Step 1: Webhook handler — Twilio calls this when the phone rings
app.post("/agents/:agentId/incoming-call", (req, res) => {
  const { agentId } = req.params;
  const agent = await db.agents.get(agentId);

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Connect>
      <ConversationRelay
        url="wss://${process.env.HOST}/agents/${agentId}/ws"
        ttsProvider="ElevenLabs"
        voice="cgSgspJ2msm6clMCkdW9"
        welcomeGreeting="${agent.greeting}"
        language="en-US"
        transcriptionProvider="deepgram"
        interruptible="true"
        profanityFilter="true"
        dtmfDetection="true"
      />
    </Connect>
  </Response>`);
});

// Step 2: WebSocket handler — receives text, sends text back
app.ws("/agents/:agentId/ws", (ws, req) => {
  const { agentId } = req.params;
  const agent = await db.agents.get(agentId);
  const conversationHistory = [];

  ws.on("message", async (data) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case "setup":
        console.log(`Call from ${msg.from} to agent ${agentId}`);
        break;

      case "prompt":
        const userText = msg.voicePrompt;
        conversationHistory.push({ role: "user", content: userText });

        const stream = await llm.chat({
          model: "claude-sonnet-4-20250514",
          system: agent.systemPrompt,
          messages: conversationHistory,
          stream: true,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const token = chunk.text;
          fullResponse += token;
          ws.send(JSON.stringify({
            type: "text",
            token: token,
            last: chunk.done,
          }));
        }
        conversationHistory.push({ role: "assistant", content: fullResponse });
        break;

      case "interrupt":
        llm.abort();
        break;

      case "dtmf":
        handleDTMF(agentId, msg.digit);
        break;
    }
  });
});
```

---

## Outbound Call (Agent Initiates)

```typescript
async function agentMakesCall(agentId, toNumber, context) {
  const agent = await db.agents.get(agentId);

  const call = await twilio.calls.create({
    to: toNumber,
    from: agent.phoneNumber,
    url: `https://${HOST}/agents/${agentId}/outbound-call?context=${encodeURIComponent(context)}`,
  });

  return call.sid;
}

app.post("/agents/:agentId/outbound-call", (req, res) => {
  const context = req.query.context;

  res.type("text/xml").send(`<Response>
    <Connect>
      <ConversationRelay
        url="wss://${HOST}/agents/${req.params.agentId}/ws?context=${context}"
        ttsProvider="ElevenLabs"
        voice="cgSgspJ2msm6clMCkdW9"
        welcomeGreeting="Hi, this is ${agentName} calling about ${context}."
      />
    </Connect>
  </Response>`);
});
```

---

## Cost Per Call (ConversationRelay)

| Component | Cost | Per 5-min Call |
|-----------|------|---------------|
| Twilio Voice (PSTN) | ~$0.014/min | $0.07 |
| ConversationRelay | $0.07/min | $0.35 |
| ElevenLabs TTS (via CR) | Included | — |
| LLM (e.g., Claude) | ~$0.003-0.01/response | ~$0.03-0.10 |
| **Total per 5-min call** | | **~$0.47-0.55** |

Media Streams DIY alternative: ~$0.03-0.06/min (about half the cost, but you build orchestration yourself).

---

## Recommendation for AgentOS

**Start with ConversationRelay.** Agents are created dynamically — CR lets you configure voice, language, greeting, and LLM per-call via TwiML parameters. Same WebSocket server handles all agents via URL-based routing. Keep full LLM control. Upgrade path to Media Streams later is clean.

1. **Phase 1 (Validate):** ConversationRelay + ElevenLabs. Get live AI calls working in days.
2. **Phase 2 (Optimize):** Add analytics, fine-tune prompts, add DTMF and human transfer.
3. **Phase 3 (Scale):** Migrate hot paths to Media Streams + Deepgram for cost optimization.
