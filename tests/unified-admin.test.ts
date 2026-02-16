/**
 * Dry test for Unified Admin UI + OTP Verification.
 * Prerequisites: Server running with DEMO_MODE=true
 * Usage: npx tsx tests/unified-admin.test.ts
 */

const SERVER_URL = "http://localhost:3100";
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}`); failed++; }
}

async function main() {
  console.log("=== Unified Admin UI Tests ===\n");

  // ── Unified Admin Page (GET /admin) ──────────────────────────────
  console.log("── Unified Admin Page ──");
  const adminRes = await fetch(`${SERVER_URL}/admin`);
  const adminHtml = await adminRes.text();

  assert(adminRes.status === 200, "GET /admin returns 200");
  assert(adminHtml.includes("AgentOS Admin"), "HTML contains 'AgentOS Admin' title");
  assert(adminHtml.includes("loginOverlay"), "HTML contains login overlay");
  assert(adminHtml.includes("sidebar") || adminHtml.includes("nav-"), "HTML contains sidebar navigation");
  assert(adminHtml.includes("Dashboard") || adminHtml.includes("dashboard"), "HTML contains Dashboard tab content");
  assert(adminHtml.includes("Settings") || adminHtml.includes("settings"), "HTML contains Settings tab content");
  assert(adminHtml.includes("Agents") || adminHtml.includes("agents"), "HTML contains Agents tab content");
  assert(adminHtml.includes("API Docs") || adminHtml.includes("api-docs") || adminHtml.includes("apiDocs"), "HTML contains API Docs tab content");
  assert(adminHtml.includes("chart.js") || adminHtml.includes("Chart.js") || adminHtml.includes("cdn.jsdelivr.net/npm/chart.js"), "HTML contains Chart.js CDN reference");
  assert(adminHtml.includes("swagger-ui") || adminHtml.includes("swagger-ui-dist"), "HTML contains Swagger UI CDN reference");

  // ── Redirects from old pages ─────────────────────────────────────
  console.log("\n── Redirects from Old Pages ──");
  const setupRes = await fetch(`${SERVER_URL}/admin/setup`, { redirect: "manual" });
  assert(setupRes.status === 301 || setupRes.status === 302, `GET /admin/setup returns redirect (${setupRes.status})`);

  const dashRes = await fetch(`${SERVER_URL}/admin/dashboard`, { redirect: "manual" });
  assert(dashRes.status === 301 || dashRes.status === 302, `GET /admin/dashboard returns redirect (${dashRes.status})`);

  const apiDocsRedirectRes = await fetch(`${SERVER_URL}/admin/api-docs`, { redirect: "manual" });
  assert(apiDocsRedirectRes.status === 301 || apiDocsRedirectRes.status === 302, `GET /admin/api-docs returns redirect (${apiDocsRedirectRes.status})`);

  // ── Dashboard Data API (GET /admin/api/dashboard) ────────────────
  console.log("\n── Dashboard Data API ──");
  const dashDataRes = await fetch(`${SERVER_URL}/admin/api/dashboard`);
  const dashData = await dashDataRes.json() as any;

  assert(dashDataRes.status === 200, "GET /admin/api/dashboard returns 200");
  assert(Array.isArray(dashData.agents), "Response has agents array");
  assert(dashData.usage && typeof dashData.usage.totalMessages !== "undefined", "Response has usage object with totalMessages");
  assert(Array.isArray(dashData.alerts), "Response has alerts array");

  // ── Usage History API (GET /admin/api/usage-history) ─────────────
  console.log("\n── Usage History API ──");
  const usageRes = await fetch(`${SERVER_URL}/admin/api/usage-history`);
  const usageData = await usageRes.json() as any;

  assert(usageRes.status === 200, "GET /admin/api/usage-history returns 200");
  assert(Array.isArray(usageData.messagesByDay), "Response has messagesByDay array");
  assert(Array.isArray(usageData.costByChannel), "Response has costByChannel array");

  // ── Voices API (GET /admin/api/voices) ───────────────────────────
  console.log("\n── Voices API ──");
  const voicesRes = await fetch(`${SERVER_URL}/admin/api/voices`);
  const voicesData = await voicesRes.json() as any;

  assert(voicesRes.status === 200, "GET /admin/api/voices returns 200");
  assert(Array.isArray(voicesData.voices), "Response has voices array");

  // ── Agents API (GET /admin/api/agents) ───────────────────────────
  console.log("\n── Agents API ──");
  const agentsRes = await fetch(`${SERVER_URL}/admin/api/agents`);
  const agentsData = await agentsRes.json() as any;

  assert(agentsRes.status === 200, "GET /admin/api/agents returns 200");
  assert(Array.isArray(agentsData.agents), "Response has agents array");
  assert(Array.isArray(agentsData.tiers), "Response has tiers array");

  // ── Agent Limits API (POST /admin/api/agents/:id/limits) ─────────
  console.log("\n── Agent Limits API ──");
  const limitsRes = await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/limits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dailyLimit: 100, monthlyLimit: 3000 }),
  });
  const limitsData = await limitsRes.json() as any;

  assert(limitsRes.status === 200, "POST /admin/api/agents/test-agent-001/limits returns 200");

  // ── Agent Billing API (POST /admin/api/agents/:id/billing) ───────
  console.log("\n── Agent Billing API ──");
  const billingRes = await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/billing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "free" }),
  });
  const billingData = await billingRes.json() as any;

  assert(billingRes.status === 200, "POST /admin/api/agents/test-agent-001/billing returns 200");

  // ── Save API (POST /admin/api/save) ──────────────────────────────
  console.log("\n── Save API ──");
  const saveTtsRes = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: { PROVIDER_TTS: "elevenlabs" } }),
  });
  const saveTtsData = await saveTtsRes.json() as any;

  assert(saveTtsRes.status === 200 && saveTtsData.success === true, "Can save PROVIDER_TTS key");

  const savePromptRes = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: { VOICE_DEFAULT_SYSTEM_PROMPT: "You are a helpful assistant." } }),
  });
  const savePromptData = await savePromptRes.json() as any;

  assert(savePromptRes.status === 200 && savePromptData.success === true, "Can save VOICE_DEFAULT_SYSTEM_PROMPT key");

  // ── Status API (GET /admin/api/status) ───────────────────────────
  console.log("\n── Status API ──");
  const statusRes = await fetch(`${SERVER_URL}/admin/api/status`);
  const statusData = await statusRes.json() as any;

  assert(statusRes.status === 200, "GET /admin/api/status returns 200");
  assert(statusData.voice && typeof statusData.voice.ttsProvider !== "undefined", "Response has voice.ttsProvider field");
  assert(statusData.voice && typeof statusData.voice.systemPrompt !== "undefined", "Response has voice.systemPrompt field");

  // ── OpenAPI Spec (GET /admin/api-docs/spec.json) ─────────────────
  console.log("\n── OpenAPI Spec ──");
  const specRes = await fetch(`${SERVER_URL}/admin/api-docs/spec.json`);
  let specValid = false;
  if (specRes.status === 200) {
    try { await specRes.json(); specValid = true; } catch {}
  }

  assert(specRes.status === 200 && specValid, "GET /admin/api-docs/spec.json returns 200 with valid JSON");

  // ── Regression Tests ─────────────────────────────────────────────
  console.log("\n── Regression Tests ──");
  const healthRes = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthRes.json() as any;

  assert(healthRes.status === 200 && healthData.status === "ok", "GET /health returns 200 with status: ok");

  const metricsRes = await fetch(`${SERVER_URL}/metrics`);
  assert(metricsRes.status === 200, "GET /metrics returns 200");

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error("Test crashed:", err); process.exit(1); });
