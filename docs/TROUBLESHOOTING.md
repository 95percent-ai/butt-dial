<!-- version: 1.0 | updated: 2026-02-22 -->

# Troubleshooting

## Server Won't Start

### Port already in use
**Pattern:** `EADDRINUSE: address already in use :::3100`
**Cause:** Another process is using port 3100.
**Fix:** Kill it: `taskkill /F /IM node.exe` (Windows) or `pkill -f node` (Mac/Linux). Or change `PORT` in `.env`.

### Invalid configuration
**Pattern:** `Invalid configuration:` followed by zod errors
**Cause:** Missing or malformed values in `.env`.
**Fix:** Check `.env.example` for correct format. All env vars have defaults except credentials.

## MCP Connection

### SSE connection fails
**Pattern:** Client can't connect to `/sse`
**Cause:** Server not running, wrong URL, or firewall blocking.
**Fix:** Verify `curl http://localhost:3100/health` returns 200.

### Tool calls return auth errors
**Pattern:** `Missing or invalid security token`
**Cause:** Token not provided or expired.
**Fix:** In demo mode, set `DEMO_MODE=true`. In production, pass token via SSE: `/sse?token=<token>`.

## Webhooks

### Inbound messages not arriving
**Pattern:** SMS/calls sent to agent's number but nothing happens.
**Cause:** Webhooks not configured on Twilio, or server not publicly accessible.
**Fix:**
1. Expose server: `ngrok http 3100`
2. Set `WEBHOOK_BASE_URL=https://<ngrok-url>` in `.env`
3. Run `comms_provision_channels` to configure Twilio webhooks

### Signature verification failed
**Pattern:** `403 Forbidden` on webhook endpoints
**Cause:** Twilio signature mismatch (wrong auth token or URL mismatch).
**Fix:** Ensure `TWILIO_AUTH_TOKEN` matches your Twilio account. Ensure `WEBHOOK_BASE_URL` matches the URL Twilio is hitting.

### Replay detected
**Pattern:** `403 Replay detected`
**Cause:** Same webhook delivered twice (same MessageSid/CallSid within 5 minutes).
**Fix:** This is working as intended. The nonce cache prevents replay attacks.

## Voice Calls

### Call connects but no AI response
**Pattern:** Caller hears silence after connecting.
**Cause:** AI agent not connected via SSE, or sampling timeout.
**Fix:** Ensure agent is connected to `/sse?agentId=<agentId>`. If agent is slow to respond, the server falls back to answering machine after 8 seconds.

### ConversationRelay WebSocket errors
**Pattern:** WebSocket closes immediately or errors on connect.
**Cause:** Twilio can't reach the WebSocket URL.
**Fix:** Ensure `WEBHOOK_BASE_URL` is publicly accessible via HTTPS. Twilio requires WSS (secure WebSocket).

## Rate Limiting

### 429 Too Many Requests
**Pattern:** HTTP requests return 429.
**Cause:** Exceeded per-IP or global HTTP rate limit.
**Fix:** Default is 60/min per IP. Increase via `HTTP_RATE_LIMIT_PER_IP` in `.env`. Or wait 1 minute.

### Tool call returns rate limit error
**Pattern:** Tool returns `Rate limit exceeded: per-day (500/500)`
**Cause:** Agent hit their action or spending cap.
**Fix:** Use `comms_set_agent_limits` to increase limits. Or wait for the reset period.

## Compliance

### Message blocked by content filter
**Pattern:** `Compliance: Message contains threatening content`
**Cause:** Message body matched a blocked pattern (threats, profanity).
**Fix:** Rephrase the message. The content filter blocks violent threats and profanity.

### Call blocked by TCPA
**Pattern:** `Compliance: TCPA: Calls not allowed at this time`
**Cause:** Attempted call outside 8 AM - 9 PM in the recipient's timezone.
**Fix:** Wait until allowed hours. Default timezone is US Eastern.

### DNC block
**Pattern:** `Compliance: +1234567890 is on the Do Not Contact list`
**Cause:** Number is in the DNC list.
**Fix:** Remove from DNC list in the database if the block is incorrect.

## Database

### Table not found
**Pattern:** `no such table: <table_name>`
**Cause:** Migrations haven't run.
**Fix:** The server runs migrations on startup. Make sure the server has started at least once. Or run manually: `npx tsx src/db/migrate.ts`.

### Database locked
**Pattern:** `SQLITE_BUSY: database is locked`
**Cause:** Multiple processes accessing the same SQLite file.
**Fix:** Ensure only one server instance is running. For production, switch to Postgres.

## Admin UI

### Setup page shows blank
**Pattern:** `/admin/setup` loads but cards are empty.
**Cause:** JavaScript error or CSP blocking inline scripts.
**Fix:** Check browser console for errors. The setup page uses inline JS/CSS which requires the relaxed CSP policy.

### POST to admin API returns 401
**Pattern:** `Missing Authorization header`
**Cause:** `ORCHESTRATOR_SECURITY_TOKEN` is set but not included in the request.
**Fix:** The setup page auto-sends the token if entered. For API calls: `Authorization: Bearer <token>`.

## Demo Mode

### Tests fail with "demo mode" errors
**Pattern:** Tests expect demo mode but server runs in production mode.
**Cause:** `DEMO_MODE=false` in `.env`.
**Fix:** Set `DEMO_MODE=true` in `.env` and restart the server before running tests.
