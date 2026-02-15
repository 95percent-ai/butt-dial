/**
 * Comprehensive dry end-to-end test — exercises the entire system.
 *
 * Covers: all MCP tools, webhooks, admin endpoints, security headers,
 * compliance, billing, dashboard, swagger, and pool management.
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/end-to-end.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");

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

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text || "{}";
  return { parsed: JSON.parse(text), isError: result.isError };
}

async function main() {
  console.log("\n=== Comprehensive End-to-End Dry Test ===\n");

  // ── Connect ─────────────────────────────────────────────────────
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "e2e-test", version: "1.0.0" });
  await client.connect(transport);
  const db = new Database(DB_PATH);

  // ── 1. Health ───────────────────────────────────────────────────
  console.log("1. Health & Readiness");
  const healthRes = await fetch(`${SERVER_URL}/health`);
  const health = await healthRes.json() as Record<string, unknown>;
  assert(health.status === "ok", "Health check OK");
  assert(health.demoMode === true, "Demo mode active");

  const readyRes = await fetch(`${SERVER_URL}/health/ready`);
  const ready = await readyRes.json() as Record<string, unknown>;
  assert(ready.status === "ready", "Readiness check OK");

  // ── 2. Metrics ──────────────────────────────────────────────────
  console.log("\n2. Metrics");
  const metricsRes = await fetch(`${SERVER_URL}/metrics`);
  const metrics = await metricsRes.text();
  assert(metricsRes.status === 200, "Metrics returns 200");
  assert(metrics.includes("mcp_"), "Metrics has mcp_ prefix");

  // ── 3. Security Headers ─────────────────────────────────────────
  console.log("\n3. Security Headers");
  assert(healthRes.headers.get("x-frame-options") === "DENY", "X-Frame-Options: DENY");
  assert(healthRes.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");

  // ── 4. Tool Listing ─────────────────────────────────────────────
  console.log("\n4. Tool Listing");
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  const expectedTools = [
    "comms_ping",
    "comms_send_message",
    "comms_get_messages",
    "comms_send_voice_message",
    "comms_make_call",
    "comms_transfer_call",
    "comms_provision_channels",
    "comms_deprovision_channels",
    "comms_get_channel_status",
    "comms_register_provider",
    "comms_onboard_customer",
    "comms_set_agent_limits",
    "comms_get_usage_dashboard",
    "comms_get_billing_summary",
    "comms_set_billing_config",
    "comms_expand_agent_pool",
  ];
  for (const tool of expectedTools) {
    assert(toolNames.includes(tool), `Tool: ${tool}`);
  }

  // ── 5. Ping ─────────────────────────────────────────────────────
  console.log("\n5. Ping");
  const ping = await callTool(client, "comms_ping", { message: "e2e" });
  assert(ping.parsed.status === "ok", "Ping OK");
  assert(ping.parsed.echo === "e2e", "Ping echo correct");

  // ── 6. Send SMS ─────────────────────────────────────────────────
  console.log("\n6. Send SMS");
  const sms = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15551234567",
    body: "E2E test message",
    channel: "sms",
  });
  assert(sms.parsed.success === true, "SMS sent");
  assert(sms.parsed.channel === "sms", "Channel is sms");

  // ── 7. Send Email ───────────────────────────────────────────────
  console.log("\n7. Send Email");
  const email = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "test@example.com",
    body: "E2E email body",
    channel: "email",
    subject: "E2E Test",
  });
  assert(email.parsed.success === true, "Email sent");

  // ── 8. Send WhatsApp ────────────────────────────────────────────
  console.log("\n8. Send WhatsApp");
  const wa = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15559876543",
    body: "E2E WhatsApp",
    channel: "whatsapp",
  });
  assert(wa.parsed.success === true, "WhatsApp sent");

  // ── 9. Get Messages ─────────────────────────────────────────────
  console.log("\n9. Get Messages");
  const msgs = await callTool(client, "comms_get_messages", {
    agentId: "test-agent-001",
    limit: 5,
  });
  assert(msgs.parsed.messages.length > 0, "Messages returned");

  // ── 10. Get Messages with contact filter ─────────────────────────
  console.log("\n10. Conversation Threading");
  const thread = await callTool(client, "comms_get_messages", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    limit: 10,
  });
  assert(Array.isArray(thread.parsed.messages), "Thread messages returned");

  // ── 11. Make Call ───────────────────────────────────────────────
  console.log("\n11. Make Call");
  const call = await callTool(client, "comms_make_call", {
    agentId: "test-agent-001",
    to: "+15551234567",
  });
  assert(call.parsed.success === true, "Call placed");
  assert(call.parsed.callSid != null, "Has callSid");

  // ── 12. Channel Status ──────────────────────────────────────────
  console.log("\n12. Channel Status");
  const status = await callTool(client, "comms_get_channel_status", {
    agentId: "test-agent-001",
  });
  assert(status.isError !== true, "Status returned");

  // ── 13. Usage Dashboard ─────────────────────────────────────────
  console.log("\n13. Usage Dashboard");
  const usage = await callTool(client, "comms_get_usage_dashboard", {
    agentId: "test-agent-001",
    period: "all",
  });
  assert(usage.parsed.totalActions >= 0, "Usage has totalActions");

  // ── 14. Billing Summary ─────────────────────────────────────────
  console.log("\n14. Billing Summary");
  const billing = await callTool(client, "comms_get_billing_summary", {
    agentId: "test-agent-001",
    period: "all",
  });
  assert(typeof billing.parsed.providerCost === "number", "Has providerCost");
  assert(typeof billing.parsed.billingCost === "number", "Has billingCost");

  // ── 15. Set Billing Config ──────────────────────────────────────
  console.log("\n15. Billing Config");
  const bc = await callTool(client, "comms_set_billing_config", {
    agentId: "test-agent-001",
    tier: "starter",
    markupPercent: 0,
  });
  assert(bc.parsed.success === true, "Billing config set");

  // ── 16. Expand Agent Pool ───────────────────────────────────────
  console.log("\n16. Agent Pool");
  const pool = await callTool(client, "comms_expand_agent_pool", {
    maxAgents: 10,
  });
  assert(pool.parsed.success === true, "Pool expanded");
  assert(pool.parsed.pool.maxAgents === 10, "Pool max is 10");

  // Reset pool
  await callTool(client, "comms_expand_agent_pool", { maxAgents: 5 });

  // ── 17. Compliance — content filter ─────────────────────────────
  console.log("\n17. Compliance");
  const threat = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15551234567",
    body: "I will kill you",
    channel: "sms",
  });
  assert(threat.isError === true, "Threat blocked");

  // DNC
  db.prepare("INSERT OR IGNORE INTO dnc_list (id, phone_number, reason, added_by) VALUES (?, ?, ?, ?)").run("e2e-dnc", "+15550001111", "e2e-test", "e2e");
  const dnc = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15550001111",
    body: "Hello",
    channel: "sms",
  });
  assert(dnc.isError === true, "DNC blocked");
  db.prepare("DELETE FROM dnc_list WHERE id = ?").run("e2e-dnc");

  // ── 18. Admin Dashboard ─────────────────────────────────────────
  console.log("\n18. Admin Pages");
  const dashRes = await fetch(`${SERVER_URL}/admin/dashboard`);
  assert(dashRes.status === 200, "Dashboard loads");

  const setupRes = await fetch(`${SERVER_URL}/admin/setup`);
  assert(setupRes.status === 200, "Setup page loads");

  const swaggerRes = await fetch(`${SERVER_URL}/admin/api-docs`);
  assert(swaggerRes.status === 200, "Swagger loads");

  const specRes = await fetch(`${SERVER_URL}/admin/api-docs/spec.json`);
  const spec = await specRes.json() as Record<string, unknown>;
  assert(spec.openapi === "3.1.0", "OpenAPI spec valid");

  // ── 19. Dashboard Data API ──────────────────────────────────────
  console.log("\n19. Dashboard Data");
  const dashData = await fetch(`${SERVER_URL}/admin/api/dashboard`);
  const dd = await dashData.json() as Record<string, unknown>;
  assert(Array.isArray(dd.agents), "Dashboard has agents");
  assert(dd.usage != null, "Dashboard has usage");

  // ── 20. Demo Scenarios ──────────────────────────────────────────
  console.log("\n20. Demo Scenarios");
  const scenarioRes = await fetch(`${SERVER_URL}/admin/api/run-scenarios`, { method: "POST" });
  const scenarios = await scenarioRes.json() as { results: Array<{ name: string; passed: boolean }>; allPassed: boolean };
  assert(scenarios.allPassed === true, `All ${scenarios.results.length} demo scenarios pass`);

  // ── Summary ─────────────────────────────────────────────────────
  await client.close();
  db.close();

  console.log(
    `\n=== End-to-End Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
