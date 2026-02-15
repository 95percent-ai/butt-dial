# Observability Guide

## Health Checks

### Liveness: GET /health
Returns 200 if the server process is running. No dependency checks.

```json
{"status":"ok","uptime":123.45,"version":"0.1.0","environment":"development","demoMode":false}
```

### Readiness: GET /health/ready
Checks all provider connections. Returns 503 if any provider is down.

```json
{"status":"ready","checks":{"database":"ok","telephony":"ok","email":"ok","tts":"ok"}}
```

## Metrics

### GET /metrics
Prometheus-compatible text format. Scrape interval: 15-30 seconds recommended.

**Counters:**
- `mcp_messages_sent_total{channel}` — Messages sent by channel
- `mcp_tool_calls_total{tool}` — Tool invocations by name
- `mcp_rate_limit_hits_total{limit_type}` — Rate limit triggers
- `mcp_http_rate_limit_hits_total` — HTTP rate limit triggers
- `mcp_webhook_received_total{type}` — Inbound webhooks by type
- `mcp_auth_failures_total` — Authentication failures

**Gauges:**
- `mcp_active_voice_sessions` — Current live voice calls
- `mcp_active_agents` — Provisioned active agents

## Structured Logging

All logs are JSON, written to stdout. Compatible with ELK, Datadog, Loki.

```json
{"level":"info","timestamp":"2026-02-15T12:00:00Z","event":"send_message_success","messageId":"uuid","agentId":"agent-001","channel":"sms"}
```

**Log levels:** info, warn, error

**No PII in logs:** Phone numbers and emails are not logged in message bodies. Only routing metadata (agent ID, channel, direction) appears.

## Audit Log

Immutable append-only log with SHA-256 hash chain. Each entry links to the previous via `prev_hash`, creating a tamper-evident chain.

**Table:** `audit_log`
- `id` — UUID
- `timestamp` — ISO timestamp
- `event_type` — Category (e.g., PROVISION, DEPROVISION, AUTH_FAILURE)
- `actor` — Who performed the action (agent ID or "system")
- `target` — What was affected
- `details` — JSON context
- `prev_hash` — Hash of previous entry
- `row_hash` — SHA-256 of current entry

**Verification:** Query the audit log and verify the hash chain is unbroken. Any tampering breaks the chain.

## Alert Manager

Severity-routed alert system:

| Severity | Routing |
|----------|---------|
| CRITICAL | WhatsApp to admin + log |
| HIGH | WhatsApp to admin + log |
| MEDIUM | Log only |
| LOW | Log only |

### WhatsApp Alerts
```env
ADMIN_WHATSAPP_NUMBER=+972501234567
ADMIN_WHATSAPP_SENDER=whatsapp:+14155238886
```

Alert format:
```
🚨 [CRITICAL] Rate limit exceeded
Agent test-agent-001: daily-spend (10.50/10). Resets at midnight UTC.
```

### Alert Triggers
- Rate limit exceeded (MEDIUM)
- Auth failure / brute force lockout (HIGH)
- Anomaly detected (MEDIUM-HIGH)
- Spending approaching limit (MEDIUM) — 80% threshold
- Provider error (HIGH)

## Dashboard

### GET /admin/dashboard
Web UI showing:
- System health status
- Provider connectivity
- Active agents list
- Usage summary (messages, actions, costs)
- Recent alerts

Auto-refreshes every 30 seconds.

### GET /admin/api/dashboard
JSON API for dashboard data:
```json
{
  "agents": [...],
  "usage": { "totalMessages": 42, "todayActions": 15, "totalCost": 3.50 },
  "alerts": [{ "severity": "MEDIUM", "message": "Rate limit exceeded", "timestamp": "..." }]
}
```
