/**
 * Dry test for Admin Dashboard (updated for dashboard overhaul).
 *
 * Tests:
 * 1. Dashboard page loads with renamed service labels
 * 2. Dashboard data API returns JSON with assistant field
 * 3. Dashboard data has agents, usage, alerts
 * 4. Top contacts API works
 * 5. Analytics API works
 * 6. New UI elements present (billing note, manage limits, search, analytics)
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
  console.log("\n=== Admin Dashboard overhaul dry test ===\n");

  // ------------------------------------------------------------------
  // 1. Dashboard page loads with new labels
  // ------------------------------------------------------------------
  console.log("Test: dashboard page + renamed labels");
  const dashRes = await fetch(`${SERVER_URL}/admin/dashboard`, { redirect: "follow" });
  assert(dashRes.status === 200, "Dashboard returns 200");
  const dashHtml = await dashRes.text();
  assert(dashHtml.includes("Butt-Dial"), "HTML has title");
  assert(dashHtml.includes("System"), "Has System service label (was Database)");
  assert(dashHtml.includes("Phone &amp; SMS") || dashHtml.includes("Phone"), "Has Phone & SMS label (was Telephony)");
  assert(dashHtml.includes("Voice AI"), "Has Voice AI label (was Voice)");
  assert(dashHtml.includes("svc-assistant"), "Has Assistant service dot");
  assert(dashHtml.includes("Active Agents") || dashHtml.includes("Agents"), "Has agents section");
  assert(dashHtml.includes("Usage") || dashHtml.includes("usage"), "Has usage section");

  // ------------------------------------------------------------------
  // 2. New UI elements
  // ------------------------------------------------------------------
  console.log("\nTest: new UI elements");
  assert(dashHtml.includes("Manage Limits"), "Has Manage Limits link");
  assert(dashHtml.includes("does not process payments"), "Has billing note");
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
  // 3. Dashboard data API with assistant
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

  const services = data.services as Record<string, unknown>;
  assert(services != null, "Has services object");
  assert(typeof services.assistant === "string", "Services has assistant field");

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
  // 6. Demo mode banner
  // ------------------------------------------------------------------
  console.log("\nTest: demo mode banner");
  assert(dashHtml.includes("DEMO MODE"), "Dashboard shows demo mode banner");

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
