<!-- version: 1.2 | updated: 2026-02-15 -->

# Errors — Pattern Library

### MCP transport body consumed by Express
**Pattern:** POST to `/messages` returns 400 or "stream is not readable" error. MCP tool listing fails.
**Cause:** `express.json()` middleware consumes the request body stream before `SSEServerTransport.handlePostMessage()` can read it.
**Fix:** Mount MCP routes (`/sse`, `/messages`) before `app.use(express.json())`. The transport needs the raw stream.

### Twilio trial account call restrictions
**Pattern:** Inbound calls fail with error 21264. Outbound calls fail with error 21219. Call status shows "failed" with 0 duration.
**Cause:** Twilio trial accounts can only make/receive calls to/from verified numbers. Verification via API (OutgoingCallerIds) is also blocked on trial accounts.
**Fix:** Upgrade to a full Twilio account, or use only numbers already verified on the account. Check verified numbers: `GET /OutgoingCallerIds.json`.

### SQLite FK constraint on WhatsApp pool assignment during provisioning
**Pattern:** `SQLITE_CONSTRAINT_FOREIGNKEY` when updating `whatsapp_pool.assigned_to_agent` during provisioning.
**Cause:** `whatsapp_pool.assigned_to_agent` references `agent_channels(agent_id)`. If you assign the pool entry before inserting the agent into `agent_channels`, the FK check fails.
**Fix:** Insert the `agent_channels` row first, then update the `whatsapp_pool` assignment. Update the agent row with WhatsApp info afterward.
