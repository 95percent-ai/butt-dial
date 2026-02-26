# Response to API Test Report

**Date:** 2026-02-26

---

## Context

The server was running in **demo mode** (`DEMO_MODE=true`). In demo mode:
- All providers (Twilio, Resend, etc.) are replaced with mock providers
- No real messages are sent or received
- Phone numbers use 555-xxx format, emails use @example.com
- WhatsApp pool is empty by design (no senders configured in demo)

Most of the "failures" in the test report are expected demo behavior, not real bugs.

---

## Issue-by-Issue Response

### 1. SMS sent to 555 numbers / Email sent to example.com
**Expected in demo mode.** Mock providers generate fake Twilio-format IDs (SM..., EM...) and return success without actually delivering anything. The 555 numbers and example.com addresses are the mock provider's placeholder values.

**In live mode:** Real Twilio numbers, real Resend emails, real delivery.

### 2. WhatsApp "unavailable" / empty pool
**Expected in demo mode.** The WhatsApp sender pool is empty — no WhatsApp senders are configured. The server correctly reports the channel as unavailable. This is not a bug.

**In live mode:** Configure WhatsApp senders in the pool, and the channel becomes available.

### 3. HTML email crash (500 / Cloudflare tunnel error)
**Real bug — fixed.** The `checkCanSpam()` compliance function ran a regex on the `html` field without verifying it was a string. If a non-string value was passed, it threw a TypeError that crashed the process.

**Fix:** Added string coercion (`String(html || body || "")`) and input sanitization for the `html` field.

### 4. `/api/v1/messages` returns 404
**Expected.** This endpoint was renamed to `/api/v1/waiting-messages` as part of Phase 27 (dead letter queue redesign). The server no longer stores a conversation history — it only stores undelivered messages (dead letters). The AI agent is responsible for its own conversation memory.

**OpenAPI spec updated** to document `/waiting-messages` instead of `/messages`.

### 5. `genderContext` in send-message response
**Intentional.** The `genderContext` object provides gender metadata for gendered languages (Hebrew, Arabic, French, etc.). It includes `agentGender` and `targetGender` fields so the calling application can adjust language accordingly.

**OpenAPI spec updated** to document this field.

### 6. `agentId` resolution / auth errors
**Simplified — token is now the only credential you need.**

When you provision an agent, you get back an API key (token). That's it — no separate `agentId` to manage. The system auto-generates an internal ID behind the scenes.

**How to connect:**
- **SSE:** `GET /sse?token=YOUR_TOKEN` — that's all. The agent is identified from the token.
- **REST API:** Pass `Authorization: Bearer YOUR_TOKEN` — no `agentId` needed in the request body.
- **Admin/org tokens:** If you're using an orchestrator or org token (which manage multiple agents), you still need to pass `agentId` to specify which agent you're acting on behalf of.

**Bottom line:** Use your agent token and skip `agentId` entirely. It's auto-detected.

### 7. `demo: true` flag in responses
**New addition.** When the server is in demo mode, send-message and provision responses now include `"demo": true` so API callers can programmatically detect that the message wasn't actually delivered.

---

## How to Switch to Live Mode

**Option A — Admin UI (recommended):**
1. Go to the Settings tab in the admin panel
2. Find the "Operation Mode" card
3. Toggle from Demo to Live
4. Confirm in the warning modal (warns about real API calls and costs)
5. Server auto-restarts with live providers

**Option B — Manual:**
1. Set `DEMO_MODE=false` in `.env`
2. Configure real provider credentials:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (for SMS + voice)
   - `RESEND_API_KEY` (for email)
   - WhatsApp senders in the pool (if needed)
3. Restart the server
4. All providers will use real APIs, messages will be delivered

**Health endpoint:** The `/health` response now includes a `mode` field ("demo" or "live") so API callers can programmatically check which mode the server is running in.

---

## Changes Made

| Change | File | Description |
|--------|------|-------------|
| Bug fix | `src/security/compliance.ts` | String coercion in `checkCanSpam()` |
| Bug fix | `src/api/rest-router.ts` | Added `html` input sanitization |
| Feature | `src/api/rest-router.ts` | `demo: true` flag in responses when in demo mode |
| Spec update | `src/admin/openapi-spec.ts` | Removed `/messages`, added `/waiting-messages`, `genderContext`, `demo`, token endpoints, capabilities format |
| Spec update | `src/api/rest-router.ts` | Same updates to inline REST OpenAPI spec |
