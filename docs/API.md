# REST API Reference

The server exposes both MCP (SSE) and REST endpoints.

## Health & Status

### GET /health
Liveness probe. Always returns 200 if the server is running.

```json
{"status":"ok","uptime":123.45,"version":"0.1.0","environment":"development","demoMode":false}
```

### GET /health/ready
Readiness probe. Checks all provider connections.

```json
{"status":"ready","checks":{"database":"ok","telephony":"ok","email":"ok","tts":"ok"}}
```

### GET /metrics
Prometheus-compatible metrics in text format.

```
mcp_messages_sent_total{channel="sms"} 42
mcp_messages_sent_total{channel="email"} 15
mcp_tool_calls_total{tool="comms_send_message"} 57
mcp_active_voice_sessions 2
```

## Legal Pages

### GET /legal/terms
Terms of Service page. Public, no auth required.

### GET /legal/aup
Acceptable Use Policy page. Public, no auth required.

### GET /legal/privacy
Privacy Policy page. Public, no auth required.

## MCP Transport

### GET /sse
Server-Sent Events endpoint for MCP client connections.

```
GET /sse?token=<agent-security-token>&agentId=<agent-id>
```

Query params:
- `token` — Security token for authentication
- `agentId` — Agent ID to register for voice routing

## Webhooks

All webhooks are POST endpoints that receive provider callbacks.

### POST /webhooks/:agentId/sms
Twilio inbound SMS. Validates `X-Twilio-Signature`.

### POST /webhooks/:agentId/email
Resend inbound email. Validates Svix signature headers.

### POST /webhooks/:agentId/whatsapp
Twilio inbound WhatsApp. Validates `X-Twilio-Signature`.

### POST /webhooks/:agentId/voice
Inbound voice call. Returns ConversationRelay TwiML.

### POST /webhooks/:agentId/outbound-voice
Outbound voice call webhook. Query param: `session=<sessionId>`.

### POST /webhooks/:agentId/call-status
Call status callback (completed, failed, etc.). Updates `call_logs` table.

### WSS /webhooks/:agentId/voice-ws
WebSocket for live AI voice conversation. Handles:
- `setup` — Initialize voice session
- `prompt` — Human speech transcribed to text
- `interrupt` — Human interrupted AI response
- `dtmf` — Keypad input

## Admin Endpoints

### GET /admin/setup
Web-based setup wizard UI.

### GET /admin/dashboard
Admin dashboard UI (agent status, costs, alerts).

### GET /admin/api-docs
Swagger UI with interactive API explorer.

### GET /admin/api-docs/spec.json
Raw OpenAPI 3.1 specification as JSON.

### GET /admin/api/status
Provider configuration status (masked values).

### GET /admin/api/dashboard
Dashboard data API. Returns agents, usage summary, alerts.

### POST /admin/api/test/twilio
Test Twilio credentials. Body: `{"accountSid":"...","authToken":"..."}`.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/test/elevenlabs
Test ElevenLabs credentials. Body: `{"apiKey":"..."}`.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/test/resend
Test Resend credentials. Body: `{"apiKey":"..."}`.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/save
Save credentials to .env. Body: `{"credentials":{"KEY":"value"}}`.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/deploy
Restart the server. Spawns new process and exits current.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/run-scenarios
Run demo test scenarios. Returns pass/fail results.
Requires: `Authorization: Bearer <masterToken>`.

### GET /admin/api/pending-accounts
List accounts with `pending_review` status. Super-admin only.
Requires: `Authorization: Bearer <masterToken>`.

### POST /admin/api/pending-accounts/:userId/review
Approve, reject, or suspend a user account. Body: `{"action":"approve"}`.
Actions: `approve` (sets production mode), `reject`, `suspend`.
Requires: `Authorization: Bearer <masterToken>`.
