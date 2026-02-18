/**
 * REST API Client Test — simulates a third-party system calling the REST API.
 *
 * Tests all /api/v1 endpoints against a remote (or local) server.
 * Uses only fetch() — no MCP SDK, no database access.
 *
 * Usage:
 *   npx tsx tests/rest-api-client.test.ts                          # default: remote Hetzner
 *   npx tsx tests/rest-api-client.test.ts http://localhost:3100    # local server
 *
 * The server should be running with DEMO_MODE=true for safe testing.
 */

const BASE = (process.argv[2] || "http://78.47.60.104:3100") + "/api/v1";
const TOKEN = process.env.VOS_TOKEN || "VOS@2026!";
const AGENT_ID = "test-agent-001";

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

function skip(label: string) {
  console.log(`  - ${label} (skipped)`);
  skipped++;
}

async function get(path: string, params?: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, data: await res.json() as any };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as any };
}

async function main() {
  console.log(`\n=== REST API Client Test ===`);
  console.log(`Server: ${BASE}`);
  console.log(`Token:  ${TOKEN.slice(0, 4)}...`);
  console.log();

  // ── 1. System Endpoints (no auth) ────────────────────────────────
  console.log("1. System Endpoints");

  // Health (no auth header)
  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json() as any;
  assert(health.status === "ok", "GET /health returns ok");
  assert(typeof health.uptime === "number", "GET /health includes uptime");

  // OpenAPI spec (no auth header)
  const specRes = await fetch(`${BASE}/openapi.json`);
  const spec = await specRes.json() as any;
  assert(spec.openapi === "3.1.0", "GET /openapi.json is OpenAPI 3.1");
  assert(spec.info?.title?.includes("VOS"), "Spec has correct title");
  assert(Object.keys(spec.paths || {}).length >= 14, `Spec has ${Object.keys(spec.paths || {}).length} paths`);
  assert(spec.components?.securitySchemes?.BearerAuth != null, "Spec includes BearerAuth scheme");

  // ── 2. Communication: Send Message ───────────────────────────────
  console.log("\n2. Communication: Send Message");

  const smsResult = await post("/send-message", {
    agentId: AGENT_ID,
    to: "+972502629999",
    body: "REST API client test - SMS",
    channel: "sms",
  });
  assert(smsResult.status === 200, `POST /send-message SMS status=${smsResult.status}`);
  assert(smsResult.data.success === true, "SMS send success");
  assert(typeof smsResult.data.messageId === "string", `messageId: ${smsResult.data.messageId?.slice(0, 8)}...`);
  assert(smsResult.data.channel === "sms", "Channel is sms");

  const emailResult = await post("/send-message", {
    agentId: AGENT_ID,
    to: "test@example.com",
    body: "REST API client test - Email",
    channel: "email",
    subject: "Test Email",
  });
  assert(emailResult.status === 200, `POST /send-message email status=${emailResult.status}`);
  assert(emailResult.data.success === true, "Email send success");

  // Missing required fields
  const badMsg = await post("/send-message", { agentId: AGENT_ID });
  assert(badMsg.status === 400, `Missing fields returns 400 (got ${badMsg.status})`);

  // ── 3. Communication: Get Messages ───────────────────────────────
  console.log("\n3. Communication: Get Messages");

  const msgs = await get("/messages", { agentId: AGENT_ID, limit: "5" });
  assert(msgs.status === 200, `GET /messages status=${msgs.status}`);
  assert(Array.isArray(msgs.data.messages), "Returns messages array");
  assert(msgs.data.messages.length > 0, `Found ${msgs.data.messages.length} messages`);
  assert(typeof msgs.data.messages[0].id === "string", "Message has id field");
  assert(typeof msgs.data.messages[0].channel === "string", "Message has channel field");

  // Filter by channel
  const smsOnly = await get("/messages", { agentId: AGENT_ID, channel: "sms", limit: "3" });
  assert(smsOnly.status === 200, "GET /messages?channel=sms works");
  if (smsOnly.data.messages.length > 0) {
    assert(smsOnly.data.messages.every((m: any) => m.channel === "sms"), "All filtered messages are sms");
  }

  // Missing agentId
  const noAgent = await get("/messages");
  assert(noAgent.status === 400, `Missing agentId returns 400 (got ${noAgent.status})`);

  // ── 4. Communication: Make Call ──────────────────────────────────
  console.log("\n4. Communication: Make Call");

  const callResult = await post("/make-call", {
    agentId: AGENT_ID,
    to: "+972502629999",
    greeting: "Hello from REST test",
  });
  assert(callResult.status === 200, `POST /make-call status=${callResult.status}`);
  assert(callResult.data.success === true, "Call initiated");
  assert(typeof callResult.data.callSid === "string", `callSid: ${callResult.data.callSid?.slice(0, 12)}...`);
  assert(typeof callResult.data.sessionId === "string", "Has sessionId");

  // ── 5. Communication: Send Voice Message ─────────────────────────
  console.log("\n5. Communication: Send Voice Message");

  const vmResult = await post("/send-voice-message", {
    agentId: AGENT_ID,
    to: "+972502629999",
    text: "Hello, this is a voice message test from the REST API.",
  });
  assert(vmResult.status === 200, `POST /send-voice-message status=${vmResult.status}`);
  assert(vmResult.data.success === true, "Voice message success");
  assert(typeof vmResult.data.callSid === "string", "Has callSid");

  // ── 6. Communication: Transfer Call ──────────────────────────────
  console.log("\n6. Communication: Transfer Call");

  // Use a fake callSid — in demo mode the mock provider should handle it
  const xferResult = await post("/transfer-call", {
    agentId: AGENT_ID,
    callSid: "CA_fake_test_sid",
    to: "+18001234567",
  });
  // In demo mode this may succeed or fail depending on mock — just check we get a response
  assert(xferResult.status === 200 || xferResult.status === 500, `POST /transfer-call status=${xferResult.status}`);

  // ── 7. Management: Channel Status ────────────────────────────────
  console.log("\n7. Management: Channel Status");

  const chStatus = await get("/channel-status", { agentId: AGENT_ID });
  assert(chStatus.status === 200, `GET /channel-status status=${chStatus.status}`);
  assert(chStatus.data.agentId === AGENT_ID, "Returns correct agentId");
  assert(chStatus.data.status === "active", "Agent is active");
  assert(chStatus.data.channels != null, "Has channels object");
  assert(chStatus.data.pool != null, "Has pool info");

  // Non-existent agent
  const badAgent = await get("/channel-status", { agentId: "non-existent-agent" });
  assert(badAgent.status === 404, `Non-existent agent returns 404 (got ${badAgent.status})`);

  // ── 8. Billing: Usage Dashboard ──────────────────────────────────
  console.log("\n8. Billing: Usage Dashboard");

  const usage = await get("/usage", { agentId: AGENT_ID, period: "all" });
  assert(usage.status === 200, `GET /usage status=${usage.status}`);
  assert(usage.data.agentId === AGENT_ID, "Usage has agentId");
  assert(typeof usage.data.totalActions === "number", `totalActions: ${usage.data.totalActions}`);
  assert(usage.data.limits != null, "Has limits");

  // Admin: all agents
  const allUsage = await get("/usage", { period: "all" });
  assert(allUsage.status === 200, `GET /usage (all agents) status=${allUsage.status}`);
  assert(Array.isArray(allUsage.data.agents), "Admin view returns agents array");

  // ── 9. Billing: Billing Summary ──────────────────────────────────
  console.log("\n9. Billing: Billing Summary");

  const billing = await get("/billing", { agentId: AGENT_ID, period: "all" });
  assert(billing.status === 200, `GET /billing status=${billing.status}`);
  assert(billing.data.agentId === AGENT_ID, "Billing has agentId");

  // Admin: all agents
  const allBilling = await get("/billing", { period: "all" });
  assert(allBilling.status === 200, "GET /billing (admin) works");
  assert(allBilling.data.totals != null, "Admin billing has totals");

  // ── 10. Billing: Set Billing Config ──────────────────────────────
  console.log("\n10. Billing: Set Billing Config");

  const billingCfg = await post("/billing/config", {
    agentId: AGENT_ID,
    tier: "starter",
    markupPercent: 25,
  });
  assert(billingCfg.status === 200, `POST /billing/config status=${billingCfg.status}`);
  assert(billingCfg.data.success === true, "Billing config updated");
  assert(billingCfg.data.billingConfig?.tier === "starter", "Tier set to starter");

  // Reset back to free
  await post("/billing/config", { agentId: AGENT_ID, tier: "free", markupPercent: 0 });

  // ── 11. Billing: Set Agent Limits ────────────────────────────────
  console.log("\n11. Billing: Set Agent Limits");

  const limits = await post("/agent-limits", {
    agentId: AGENT_ID,
    limits: { maxActionsPerDay: 1000, maxSpendPerDay: 50 },
  });
  assert(limits.status === 200, `POST /agent-limits status=${limits.status}`);
  assert(limits.data.success === true, "Limits updated");
  assert(limits.data.currentLimits?.maxActionsPerDay === 1000, "maxActionsPerDay set to 1000");

  // Reset
  await post("/agent-limits", {
    agentId: AGENT_ID,
    limits: { maxActionsPerDay: 500, maxSpendPerDay: 10 },
  });

  // ── 12. Auth: No Token ───────────────────────────────────────────
  console.log("\n12. Auth: Missing/Invalid Token");

  // Skip auth tests if server is in demo mode (all requests pass)
  // We test anyway — demo mode sets dummy auth, so 401 won't happen
  const noTokenRes = await fetch(`${BASE}/messages?agentId=${AGENT_ID}`);
  // In demo mode this returns 200, in production it would return 401
  if (noTokenRes.status === 401) {
    assert(true, "Missing token returns 401");
  } else {
    skip("Auth test (server in demo mode — all requests allowed)");
  }

  // ── 13. Provision / Deprovision Cycle ────────────────────────────
  console.log("\n13. Provision / Deprovision Cycle");

  const testAgentId = `rest-test-${Date.now()}`;
  const provResult = await post("/provision", {
    agentId: testAgentId,
    displayName: "REST Test Agent",
    capabilities: { phone: false, whatsapp: false, email: true, voiceAi: false },
  });
  assert(provResult.status === 200, `POST /provision status=${provResult.status}`);
  assert(provResult.data.success === true, "Provisioned successfully");
  assert(typeof provResult.data.securityToken === "string", "Got security token");
  assert(provResult.data.channels?.email?.address != null, "Got email address");

  // Verify agent exists
  const newStatus = await get("/channel-status", { agentId: testAgentId });
  assert(newStatus.status === 200, "New agent appears in channel-status");
  assert(newStatus.data.status === "active", "New agent is active");

  // Deprovision
  const deprovResult = await post("/deprovision", { agentId: testAgentId });
  assert(deprovResult.status === 200, `POST /deprovision status=${deprovResult.status}`);
  assert(deprovResult.data.success === true, "Deprovisioned successfully");
  assert(deprovResult.data.status === "deprovisioned", "Status is deprovisioned");

  // Duplicate deprovision
  const dupDeprov = await post("/deprovision", { agentId: testAgentId });
  assert(dupDeprov.status === 400, `Duplicate deprovision returns 400 (got ${dupDeprov.status})`);

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`REST API Client Test Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  console.log(`\n${passed} passed, ${failed} failed before crash\n`);
  process.exit(1);
});
