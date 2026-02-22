<!-- version: 1.0 | updated: 2026-02-22 -->

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
Server-Sent Events endpoint for MCP client connections. **Requires authentication** (DEC-074).

```
GET /sse?token=<agent-security-token>&agentId=<agent-id>
```

Query params:
- `token` (required) — Security token for authentication. Supports orchestrator, org, or agent tokens.
- `agentId` (optional) — Agent ID to register for voice routing. If an agent token is used, `agentId` must match the token's bound agent.

Auth validation: same 3-tier logic as POST `/messages`. Brute-force tracking applies (10 failures → 15-min lockout). Demo mode skips auth.

## Webhooks

All webhooks are POST endpoints that receive provider callbacks. Inbound messages on blocked channels return silently (HTTP 200 with empty body).

### POST /webhooks/:agentId/sms
Twilio inbound SMS. Validates `X-Twilio-Signature`.

### POST /webhooks/:agentId/email
Resend inbound email. Validates Svix signature headers.

### POST /webhooks/:agentId/whatsapp
Twilio inbound WhatsApp. Validates `X-Twilio-Signature`.

### POST /webhooks/:agentId/voice
Inbound voice call. Returns ConversationRelay TwiML.

### POST /webhooks/:agentId/line
Inbound LINE message. Validates `x-line-signature` via HMAC-SHA256.

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

### GET /admin
Unified admin panel (dashboard, agents, settings, API docs, simulator). Requires session cookie or Bearer token.

### GET /admin/setup
Web-based setup wizard UI.

### GET /admin/api-docs
Swagger UI with interactive API explorer.

### GET /admin/api-docs/spec.json
Raw OpenAPI 3.1 specification as JSON.

### GET /admin/api/status
Provider configuration status (masked values).

### GET /admin/api/dashboard
Dashboard data API. Returns agents (with `blocked_channels`), usage summary (totalMessages, todayActions, totalCost), services with provider names, and alerts.

Query params:
- `agentId` (optional) — Filter usage data by agent (agents list always returns full set for dropdown).

### GET /admin/api/agents
List all provisioned agents. Returns `agents` array with channel mappings, status, and `blocked_channels`.

### GET /admin/api/analytics
Analytics data: delivery rate, channel distribution, peak hours, error rate, cost trend.

Query params:
- `agentId` (optional) — Filter by agent.

### GET /admin/api/top-contacts
Top contacts by message volume.

Query params:
- `agentId` (optional) — Filter by agent.

### GET /admin/api/usage-history
Usage history data for charts.

Query params:
- `agentId` (optional) — Filter by agent.

### GET /admin/api/my-token
Returns the current user's API token (from session cookie).

### POST /admin/api/regenerate-token
Generates a new API token for the current user.

### GET /admin/api/my-org
Returns the caller's organization info (role, org ID, name, mode, status, agent count, pool capacity).

### POST /admin/api/agents/:agentId/blocked-channels
Set blocked channels for an agent. Requires session cookie or Bearer token.

Body:
```json
{"blockedChannels": ["sms", "voice"]}
```

Valid channels: `sms`, `voice`, `email`, `whatsapp`, `line`. Use `["*"]` to block all channels. Use `[]` to unblock all.

Response:
```json
{"success": true, "agentId": "my-agent", "blockedChannels": ["sms", "voice"]}
```

### POST /admin/api/test/twilio
Test Twilio credentials. Body: `{"accountSid":"...","authToken":"..."}`.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/test/elevenlabs
Test ElevenLabs credentials. Body: `{"apiKey":"..."}`.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/test/resend
Test Resend credentials. Body: `{"apiKey":"..."}`.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/save
Save credentials to .env. Body: `{"credentials":{"KEY":"value"}}`.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/deploy
Restart the server. Spawns new process and exits current.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/run-scenarios
Run demo test scenarios. Returns pass/fail results.
Requires: `Authorization: Bearer <orchestratorToken>`.

### GET /admin/api/pending-accounts
List accounts with `pending_review` status. Super-admin only.
Requires: `Authorization: Bearer <orchestratorToken>`.

### POST /admin/api/pending-accounts/:userId/review
Approve, reject, or suspend a user account. Body: `{"action":"approve"}`.
Actions: `approve` (sets production mode), `reject`, `suspend`.
Requires: `Authorization: Bearer <orchestratorToken>`.
