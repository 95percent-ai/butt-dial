/**
 * Dry test for Phase 16 — Setup UI + Admin Dashboard.
 *
 * Tests:
 * 1. Dashboard page loads at /admin/dashboard
 * 2. Dashboard data API returns JSON
 * 3. Dashboard data has agents array
 * 4. Dashboard data has usage section
 * 5. Dashboard data has alerts section
 * 6. Setup wizard still loads (regression)
 * 7. Swagger UI still loads (regression)
 * 8. Health check works (regression)
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
  console.log("\n=== Phase 16: Setup UI + Admin Dashboard dry test ===\n");

  // ------------------------------------------------------------------
  // 1. Dashboard page loads
  // ------------------------------------------------------------------
  console.log("Test: dashboard page");
  const dashRes = await fetch(`${SERVER_URL}/admin/dashboard`);
  assert(dashRes.status === 200, "Dashboard returns 200");
  const dashHtml = await dashRes.text();
  assert(dashHtml.includes("Admin Dashboard"), "HTML has title");
  assert(dashHtml.includes("System Health"), "Has health section");
  assert(dashHtml.includes("Active Agents"), "Has agents section");
  assert(dashHtml.includes("Usage Summary"), "Has usage section");
  assert(dashHtml.includes("Recent Alerts"), "Has alerts section");

  // ------------------------------------------------------------------
  // 2. Dashboard data API
  // ------------------------------------------------------------------
  console.log("\nTest: dashboard data API");
  const dataRes = await fetch(`${SERVER_URL}/admin/api/dashboard`);
  assert(dataRes.status === 200, "Dashboard API returns 200");
  const data = await dataRes.json() as Record<string, unknown>;

  // ------------------------------------------------------------------
  // 3. Agents array
  // ------------------------------------------------------------------
  assert(Array.isArray(data.agents), "Has agents array");

  // ------------------------------------------------------------------
  // 4. Usage section
  // ------------------------------------------------------------------
  const usage = data.usage as Record<string, unknown>;
  assert(usage != null, "Has usage section");
  assert(typeof usage.totalMessages === "number", "Usage has totalMessages");
  assert(typeof usage.todayActions === "number", "Usage has todayActions");
  assert(typeof usage.totalCost === "number", "Usage has totalCost");

  // ------------------------------------------------------------------
  // 5. Alerts section
  // ------------------------------------------------------------------
  assert(Array.isArray(data.alerts), "Has alerts array");

  // ------------------------------------------------------------------
  // 6. Demo mode banner
  // ------------------------------------------------------------------
  console.log("\nTest: demo mode banner");
  assert(dashHtml.includes("DEMO MODE"), "Dashboard shows demo mode banner");

  // ------------------------------------------------------------------
  // 7-8. Regression tests
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
