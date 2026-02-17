/**
 * Dry test for Phase 11 — Observability & Admin Alerts.
 *
 * Unit tests (no server needed):
 * 1.  metrics.increment increases counter
 * 2.  metrics.increment with labels creates separate counters
 * 3.  metrics.gauge sets value
 * 4.  metrics.getPrometheusText returns valid Prometheus format
 * 5.  appendAuditLog inserts a row with hash
 * 6.  appendAuditLog chains hashes across multiple rows
 * 7.  verifyAuditChain passes on valid chain
 * 8.  verifyAuditChain detects corrupted row
 * 9.  getAuditLogs returns entries
 * 10. getAuditLogs filters by eventType
 * 11. getAuditLogs filters by actor
 * 12. sendAdminWhatsAppAlert returns false when not configured
 * 13. sendAlert CRITICAL fires WhatsApp + log + audit + metrics
 * 14. sendAlert MEDIUM fires log + audit + metrics (no WhatsApp)
 * 15. sendAlert LOW fires log + metrics (no audit)
 *
 * Integration tests (server with DEMO_MODE=true):
 * 16. /metrics returns 200 with Prometheus content type
 * 17. /metrics contains mcp_uptime_seconds gauge
 * 18. /health returns 200 (regression)
 * 19. /health/ready returns real DB status
 * 20. SMS send increments mcp_messages_sent_total
 * 21. Provisioning creates audit_log entry
 * 22. Deprovision creates audit_log entry
 * 23. SMS regression — send still works
 * 24. Email regression — send still works
 * 25. WhatsApp regression — send still works
 *
 * Usage: npx tsx tests/observability.test.ts
 */

import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");
const SERVER_URL = "http://localhost:3100";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// =======================================================================
// Phase A — Unit tests (no server needed)
// =======================================================================

function createTestDb() {
  const db = new Database(":memory:");
  const projectRoot = path.join(__dirname, "..");
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-security.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-rate-limiting.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-observability.sql"), "utf-8"));

  return {
    db,
    provider: {
      query: <T>(sql: string, params?: unknown[]): T[] => {
        const stmt = db.prepare(sql);
        return (params ? stmt.all(...params) : stmt.all()) as T[];
      },
      run: (sql: string, params?: unknown[]) => {
        const stmt = db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return { changes: result.changes };
      },
      exec: (sql: string) => db.exec(sql),
      close: () => db.close(),
    },
  };
}

async function testMetrics() {
  console.log("\n--- Metrics ---");

  const { metrics } = await import("../src/observability/metrics.js");
  metrics.resetMetrics();

  // 1. increment increases counter
  metrics.increment("test_counter");
  assert(metrics.getCounter("test_counter") === 1, "1. increment increases counter");

  // 2. increment with labels creates separate counters
  metrics.increment("test_labeled", { channel: "sms" });
  metrics.increment("test_labeled", { channel: "email" });
  metrics.increment("test_labeled", { channel: "sms" });
  assert(metrics.getCounter("test_labeled", { channel: "sms" }) === 2, "2. labeled counters are separate (sms=2)");
  assert(metrics.getCounter("test_labeled", { channel: "email" }) === 1, "2b. labeled counters are separate (email=1)");

  // 3. gauge sets value
  metrics.gauge("test_gauge", 42);
  assert(metrics.getGauge("test_gauge") === 42, "3. gauge sets value");

  // 4. Prometheus text format
  const text = metrics.getPrometheusText();
  assert(text.includes("test_counter 1"), "4a. Prometheus text includes counter");
  assert(text.includes("# TYPE test_counter counter"), "4b. Prometheus text has TYPE line");
  assert(text.includes("# TYPE test_gauge gauge"), "4c. Prometheus text has gauge TYPE");
  assert(text.includes('test_labeled{channel="sms"} 2'), "4d. Prometheus text includes labeled counter");

  metrics.resetMetrics();
}

async function testAuditLog() {
  console.log("\n--- Audit Log ---");

  const { appendAuditLog, verifyAuditChain, getAuditLogs } = await import("../src/observability/audit-log.js");
  const { provider } = createTestDb();

  // 5. appendAuditLog inserts a row with hash
  const id1 = appendAuditLog(provider, {
    eventType: "agent_provisioned",
    actor: "admin",
    target: "agent-001",
    details: { channels: ["sms", "email"] },
  });
  assert(typeof id1 === "string" && id1.length > 0, "5. appendAuditLog returns an ID");

  // 6. chains hashes
  const id2 = appendAuditLog(provider, {
    eventType: "agent_deprovisioned",
    actor: "admin",
    target: "agent-001",
  });
  const rows = provider.query<{ prev_hash: string | null; row_hash: string }>(
    "SELECT prev_hash, row_hash FROM audit_log ORDER BY rowid ASC"
  );
  assert(rows.length === 2, "6a. two audit rows exist");
  assert(rows[0].prev_hash === null, "6b. first row has null prev_hash");
  assert(rows[1].prev_hash === rows[0].row_hash, "6c. second row chains to first");

  // 7. verifyAuditChain passes on valid chain
  const result = verifyAuditChain(provider);
  assert(result.valid === true, "7. verifyAuditChain passes on valid chain");
  assert(result.checkedCount === 2, "7b. checked 2 rows");

  // 8. verifyAuditChain detects corruption
  provider.run("UPDATE audit_log SET details = '{\"tampered\": true}' WHERE id = ?", [id1]);
  const corrupted = verifyAuditChain(provider);
  assert(corrupted.valid === false, "8. verifyAuditChain detects corrupted row");
  assert(corrupted.brokenAtIndex === 0, "8b. corruption at index 0");

  // Fix it back for further tests — create fresh db
  const { provider: freshDb } = createTestDb();
  appendAuditLog(freshDb, { eventType: "test_event", actor: "system", target: "t1" });
  appendAuditLog(freshDb, { eventType: "agent_provisioned", actor: "admin", target: "t2" });
  appendAuditLog(freshDb, { eventType: "test_event", actor: "admin", target: "t3" });

  // 9. getAuditLogs returns entries
  const logs = getAuditLogs(freshDb);
  assert(logs.length === 3, "9. getAuditLogs returns all entries");

  // 10. filter by eventType
  const filtered = getAuditLogs(freshDb, { eventType: "test_event" });
  assert(filtered.length === 2, "10. getAuditLogs filters by eventType");

  // 11. filter by actor
  const actorFiltered = getAuditLogs(freshDb, { actor: "system" });
  assert(actorFiltered.length === 1, "11. getAuditLogs filters by actor");

  provider.close();
  freshDb.close();
}

async function testWhatsAppAlerter() {
  console.log("\n--- WhatsApp Alerter ---");

  const { sendAdminWhatsAppAlert } = await import("../src/observability/whatsapp-alerter.js");

  // 12. returns false when not configured (no ADMIN_WHATSAPP_NUMBER set)
  const result = await sendAdminWhatsAppAlert({
    severity: "CRITICAL",
    title: "Test alert",
    message: "This should not send",
  });
  assert(result === false, "12. sendAdminWhatsAppAlert returns false when not configured");
}

async function testAlertManager() {
  console.log("\n--- Alert Manager ---");

  const { sendAlert, initAlertManager } = await import("../src/observability/alert-manager.js");
  const { metrics } = await import("../src/observability/metrics.js");
  metrics.resetMetrics();

  const { provider } = createTestDb();
  initAlertManager(provider);

  // 13. CRITICAL fires metrics + audit (WhatsApp won't send — not configured, but should not throw)
  await sendAlert({
    severity: "CRITICAL",
    title: "System down",
    message: "Database unreachable",
    actor: "system",
  });
  assert(metrics.getCounter("mcp_alerts_total", { severity: "CRITICAL" }) === 1, "13a. CRITICAL increments metric");
  const critLogs = provider.query<{ event_type: string }>(
    "SELECT event_type FROM audit_log WHERE event_type = 'alert_critical'"
  );
  assert(critLogs.length === 1, "13b. CRITICAL creates audit log entry");

  // 14. MEDIUM fires metrics + audit (no WhatsApp)
  await sendAlert({
    severity: "MEDIUM",
    title: "Rate limit hit",
    message: "Agent xyz exceeded per-minute limit",
    actor: "agent-xyz",
  });
  assert(metrics.getCounter("mcp_alerts_total", { severity: "MEDIUM" }) === 1, "14a. MEDIUM increments metric");
  const medLogs = provider.query<{ event_type: string }>(
    "SELECT event_type FROM audit_log WHERE event_type = 'alert_medium'"
  );
  assert(medLogs.length === 1, "14b. MEDIUM creates audit log entry");

  // 15. LOW fires metrics only (no audit)
  await sendAlert({
    severity: "LOW",
    title: "Info event",
    message: "Something minor happened",
  });
  assert(metrics.getCounter("mcp_alerts_total", { severity: "LOW" }) === 1, "15a. LOW increments metric");
  const lowLogs = provider.query<{ event_type: string }>(
    "SELECT event_type FROM audit_log WHERE event_type = 'alert_low'"
  );
  assert(lowLogs.length === 0, "15b. LOW does not create audit log entry");

  metrics.resetMetrics();
  provider.close();
}

// =======================================================================
// Phase B — Integration tests (requires running server with DEMO_MODE=true)
// =======================================================================

async function mcpCall(tool: string, args: Record<string, unknown>) {
  // Connect to SSE
  const sseRes = await fetch(`${SERVER_URL}/sse`);
  const reader = sseRes.body!.getReader();
  const decoder = new TextDecoder();

  let sessionId = "";
  // Read until we get the endpoint event
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    const match = text.match(/sessionId=([a-f0-9-]+)/);
    if (match) {
      sessionId = match[1];
      break;
    }
  }

  if (!sessionId) throw new Error("Could not get session ID");

  // Initialize
  await fetch(`${SERVER_URL}/messages?sessionId=${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } }),
  });

  // Call the tool
  const res = await fetch(`${SERVER_URL}/messages?sessionId=${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }),
  });

  // Read SSE for the result
  let result = "";
  const timeout = setTimeout(() => reader.cancel(), 5000);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);

    // Look for tool result
    if (text.includes('"id":2') || text.includes('"id": 2')) {
      const dataMatch = text.match(/data: (.+)/g);
      if (dataMatch) {
        for (const d of dataMatch) {
          const json = d.replace("data: ", "");
          try {
            const parsed = JSON.parse(json);
            if (parsed.id === 2 && parsed.result) {
              clearTimeout(timeout);
              reader.cancel();
              return parsed.result;
            }
          } catch { /* not json, continue */ }
        }
      }
    }
  }

  clearTimeout(timeout);
  return null;
}

async function testMetricsEndpoint() {
  console.log("\n--- /metrics Endpoint ---");

  // 16. /metrics returns 200 with Prometheus content type
  const res = await fetch(`${SERVER_URL}/metrics`);
  assert(res.status === 200, "16a. /metrics returns 200");
  const ct = res.headers.get("content-type") || "";
  assert(ct.includes("text/plain"), "16b. /metrics has text/plain content type");

  // 17. contains uptime gauge
  const text = await res.text();
  assert(text.includes("mcp_uptime_seconds"), "17. /metrics contains mcp_uptime_seconds");
}

async function testHealthEndpoints() {
  console.log("\n--- Health Endpoints ---");

  // 18. /health still works (regression)
  const healthRes = await fetch(`${SERVER_URL}/health`);
  assert(healthRes.status === 200, "18. /health returns 200");

  // 19. /health/ready returns real DB status
  const readyRes = await fetch(`${SERVER_URL}/health/ready`);
  const readyData = await readyRes.json() as { status: string; providers: { database: string } };
  assert(readyRes.status === 200, "19a. /health/ready returns 200");
  assert(readyData.providers.database === "ok", "19b. /health/ready database is ok");
}

async function testSendMetrics() {
  console.log("\n--- Send Metrics Integration ---");

  // Get initial metrics
  const before = await (await fetch(`${SERVER_URL}/metrics`)).text();
  const beforeMatch = before.match(/mcp_messages_sent_total\{channel="sms"\} (\d+)/);
  const beforeCount = beforeMatch ? parseInt(beforeMatch[1]) : 0;

  // 20. Send SMS → mcp_messages_sent_total increments
  const testAgentId = "test-agent-obs-" + randomUUID().slice(0, 8);

  // First provision an agent
  await mcpCall("comms_provision_channels", {
    agentId: testAgentId,
    displayName: "Obs Test Agent",
    capabilities: { phone: true, whatsapp: false, email: true, voiceAi: false },
  });

  // Send SMS
  await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "+15551234567",
    body: "Observability test",
    channel: "sms",
  });

  const after = await (await fetch(`${SERVER_URL}/metrics`)).text();
  const afterMatch = after.match(/mcp_messages_sent_total\{channel="sms"\} (\d+)/);
  const afterCount = afterMatch ? parseInt(afterMatch[1]) : 0;
  assert(afterCount > beforeCount, "20. SMS send increments mcp_messages_sent_total");

  // 21. Provisioning created audit_log entry
  const db = new Database(DB_PATH);
  const provRows = db.prepare(
    "SELECT * FROM audit_log WHERE event_type = 'agent_provisioned' AND target = ?"
  ).all(testAgentId);
  assert(provRows.length >= 1, "21. Provisioning creates audit_log entry");

  // 22. Deprovision creates audit_log entry
  await mcpCall("comms_deprovision_channels", {
    agentId: testAgentId,
    releaseNumber: false,
  });

  const deprovRows = db.prepare(
    "SELECT * FROM audit_log WHERE event_type = 'agent_deprovisioned' AND target = ?"
  ).all(testAgentId);
  assert(deprovRows.length >= 1, "22. Deprovision creates audit_log entry");

  db.close();
}

async function testRegressionChannels() {
  console.log("\n--- Channel Regressions ---");

  const testAgentId = "test-agent-reg-" + randomUUID().slice(0, 8);

  // Seed a WhatsApp pool entry for provisioning
  const regDb = new Database(DB_PATH);
  regDb.prepare(
    "INSERT OR IGNORE INTO whatsapp_pool (id, phone_number, sender_sid, status) VALUES (?, ?, ?, 'available')"
  ).run("wa-pool-obs-001", "+15559990001", "WA_OBS_TEST_001");
  regDb.close();

  // Provision with all channels
  await mcpCall("comms_provision_channels", {
    agentId: testAgentId,
    displayName: "Regression Agent",
    capabilities: { phone: true, whatsapp: true, email: true, voiceAi: false },
  });

  // 23. SMS regression
  const smsResult = await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "+15559876543",
    body: "SMS regression test",
    channel: "sms",
  });
  const smsContent = smsResult?.content?.[0]?.text ?? "{}";
  const smsParsed = JSON.parse(smsContent);
  assert(smsParsed.success === true, "23. SMS send still works (regression)");

  // 24. Email regression
  const emailResult = await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "test@example.com",
    body: "Email regression test",
    channel: "email",
    subject: "Regression Test",
  });
  const emailContent = emailResult?.content?.[0]?.text ?? "{}";
  const emailParsed = JSON.parse(emailContent);
  assert(emailParsed.success === true, "24. Email send still works (regression)");

  // 25. WhatsApp regression
  const waResult = await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "+15551112222",
    body: "WhatsApp regression test",
    channel: "whatsapp",
  });
  const waContent = waResult?.content?.[0]?.text ?? "{}";
  const waParsed = JSON.parse(waContent);
  assert(waParsed.success === true, "25. WhatsApp send still works (regression)");

  // Clean up
  await mcpCall("comms_deprovision_channels", {
    agentId: testAgentId,
    releaseNumber: false,
  });

  // Remove WA pool entry
  const cleanRegDb = new Database(DB_PATH);
  cleanRegDb.prepare("DELETE FROM whatsapp_pool WHERE id = 'wa-pool-obs-001'").run();
  cleanRegDb.close();
}

// =======================================================================
// Main
// =======================================================================

async function main() {
  console.log("=== Phase 11: Observability & Admin Alerts — Test Suite ===\n");

  // Phase A — Unit tests
  console.log("Phase A: Unit tests (no server needed)");
  await testMetrics();
  await testAuditLog();
  await testWhatsAppAlerter();
  await testAlertManager();

  // Phase B — Integration tests
  console.log("\n\nPhase B: Integration tests (requires DEMO_MODE=true server)");
  try {
    const healthCheck = await fetch(`${SERVER_URL}/health`);
    if (healthCheck.ok) {
      await testMetricsEndpoint();
      await testHealthEndpoints();
      await testSendMetrics();
      await testRegressionChannels();
    } else {
      console.log("  [SKIP] Server not running — skipping integration tests");
    }
  } catch {
    console.log("  [SKIP] Server not reachable — skipping integration tests");
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
