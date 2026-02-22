/**
 * Dry test for Admin Dashboard (updated for dashboard enhancements).
 *
 * Tests:
 * 1. Dashboard page loads with key UI elements
 * 2. New features: info tooltips, download buttons, agent filter
 * 3. Dashboard data API returns JSON with provider names in services
 * 4. Top contacts API works
 * 5. Analytics API works
 * 6. Agent filter query param works
 * 7. Regression: setup, swagger, health
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/dashboard.test.ts
 */

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

async function main() {
  console.log("\n=== Admin Dashboard dry test ===\n");

  // Login to get session cookie for page tests
  let cookie = "";
  try {
    const loginRes = await fetch(`${SERVER_URL}/auth/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "inon@95percent.ai", password: "12345678" }),
    });
    const setCookie = loginRes.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
  } catch {}

  const pageHeaders: Record<string, string> = cookie ? { Cookie: cookie } : {};

  // ------------------------------------------------------------------
  // 1. Dashboard page loads with key elements
  // ------------------------------------------------------------------
  console.log("Test: dashboard page loads");
  const dashRes = await fetch(`${SERVER_URL}/admin`, { headers: pageHeaders, redirect: "follow" });
  assert(dashRes.status === 200, "Dashboard returns 200");
  const dashHtml = await dashRes.text();
  assert(dashHtml.includes("Butt-Dial"), "HTML has title");
  assert(dashHtml.includes("Provisioned Agents") || dashHtml.includes("Agents"), "Has agents section");
  assert(dashHtml.includes("service-strip"), "Has service status strip");

  // ------------------------------------------------------------------
  // 2. New UI features
  // ------------------------------------------------------------------
  console.log("\nTest: new UI features");
  assert(dashHtml.includes("info-icon"), "Has info tooltip icons");
  assert(dashHtml.includes("info-tooltip"), "Has tooltip content");
  assert(dashHtml.includes("download-btn"), "Has download buttons");
  assert(dashHtml.includes("agent-filter"), "Has agent filter dropdown");
  assert(dashHtml.includes("downloadCSV"), "Has CSV download function");
  assert(dashHtml.includes("onAgentFilterChange"), "Has agent filter change handler");
  assert(dashHtml.includes("activity-search"), "Has activity search input");
  assert(dashHtml.includes("No data yet"), "Has chart empty state placeholder");
  assert(dashHtml.includes("Top Contacts"), "Has top contacts section");
  assert(dashHtml.includes("Analytics"), "Has analytics section");
  assert(dashHtml.includes("Delivery Rate"), "Has delivery rate chart");
  assert(dashHtml.includes("Channel Distribution"), "Has channel distribution chart");
  assert(dashHtml.includes("Peak Hours"), "Has peak hours chart");
  assert(dashHtml.includes("Error Rate"), "Has error rate chart");
  assert(dashHtml.includes("Cost Trend"), "Has cost trend chart");

  // ------------------------------------------------------------------
  // 3. Dashboard data API with provider names
  // ------------------------------------------------------------------
  console.log("\nTest: dashboard data API");
  const dataRes = await fetch(`${SERVER_URL}/admin/api/dashboard`);
  assert(dataRes.status === 200, "Dashboard API returns 200");
  const data = await dataRes.json() as Record<string, unknown>;
  assert(Array.isArray(data.agents), "Has agents array");

  const usage = data.usage as Record<string, unknown>;
  assert(usage != null, "Has usage section");
  assert(typeof usage.totalMessages === "number", "Usage has totalMessages");
  assert(typeof usage.todayActions === "number", "Usage has todayActions");
  assert(typeof usage.totalCost === "number", "Usage has totalCost");

  assert(Array.isArray(data.alerts), "Has alerts array");

  const services = data.services as Record<string, Record<string, unknown>>;
  assert(services != null, "Has services object");
  assert(typeof services.assistant === "object" && services.assistant.provider === "Anthropic", "Services assistant has provider name");
  assert(typeof services.database === "object" && services.database.provider === "SQLite", "Services database has provider name");
  assert(typeof services.telephony === "object" && services.telephony.provider === "Twilio", "Services telephony has provider name");
  assert(typeof services.email === "object" && services.email.provider === "Resend", "Services email has provider name");

  // ------------------------------------------------------------------
  // 4. Top contacts API
  // ------------------------------------------------------------------
  console.log("\nTest: top contacts API");
  const topRes = await fetch(`${SERVER_URL}/admin/api/top-contacts`);
  assert(topRes.status === 200, "Top contacts API returns 200");
  const topData = await topRes.json() as Record<string, unknown>;
  assert(Array.isArray(topData.contacts), "Has contacts array");

  // ------------------------------------------------------------------
  // 5. Analytics API
  // ------------------------------------------------------------------
  console.log("\nTest: analytics API");
  const analyticsRes = await fetch(`${SERVER_URL}/admin/api/analytics`);
  assert(analyticsRes.status === 200, "Analytics API returns 200");
  const analytics = await analyticsRes.json() as Record<string, unknown>;
  assert(analytics.deliveryRate != null, "Has deliveryRate");
  assert(Array.isArray(analytics.channelDistribution), "Has channelDistribution array");
  assert(Array.isArray(analytics.peakHours), "Has peakHours array");
  assert(Array.isArray(analytics.costTrend), "Has costTrend array");
  assert(Array.isArray(analytics.errorRate), "Has errorRate array");

  // ------------------------------------------------------------------
  // 6. Agent filter query param
  // ------------------------------------------------------------------
  console.log("\nTest: agent filter query param");
  const filteredRes = await fetch(`${SERVER_URL}/admin/api/dashboard?agentId=main-receptionist`);
  assert(filteredRes.status === 200, "Filtered dashboard API returns 200");
  const filteredData = await filteredRes.json() as Record<string, unknown>;
  assert(Array.isArray(filteredData.agents), "Filtered response still has agents array");
  // Agents list should NOT be filtered (always full for dropdown)
  assert((filteredData.agents as Array<unknown>).length >= 1, "Agents list not filtered by agentId");

  const filteredHistRes = await fetch(`${SERVER_URL}/admin/api/usage-history?agentId=main-receptionist`);
  assert(filteredHistRes.status === 200, "Filtered usage-history returns 200");

  const filteredAnalyticsRes = await fetch(`${SERVER_URL}/admin/api/analytics?agentId=main-receptionist`);
  assert(filteredAnalyticsRes.status === 200, "Filtered analytics returns 200");

  const filteredContactsRes = await fetch(`${SERVER_URL}/admin/api/top-contacts?agentId=main-receptionist`);
  assert(filteredContactsRes.status === 200, "Filtered top-contacts returns 200");

  // ------------------------------------------------------------------
  // 7. Regression tests
  // ------------------------------------------------------------------
  console.log("\nTest: regression");
  const setupRes = await fetch(`${SERVER_URL}/admin/setup`);
  assert(setupRes.status === 200, "Setup wizard still loads");

  const swaggerRes = await fetch(`${SERVER_URL}/admin/api-docs`);
  assert(swaggerRes.status === 200, "Swagger UI still loads");

  const healthRes = await fetch(`${SERVER_URL}/health`);
  const health = await healthRes.json() as Record<string, unknown>;
  assert(health.status === "ok", "Health check passes");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
