/**
 * Dry test for Phase 15 — Swagger + API Explorer.
 *
 * Tests:
 * 1. Swagger UI page loads at /admin/api-docs
 * 2. OpenAPI spec served at /admin/api-docs/spec.json
 * 3. Spec has correct openapi version
 * 4. Spec has paths for all major routes
 * 5. Spec has x-mcp-tools section
 * 6. Demo mode banner shown in Swagger UI
 * 7. Scenario runner returns results
 * 8. All scenarios pass in demo mode
 * 9. Regression: setup page still works
 * 10. Regression: health check works
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/swagger.test.ts
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
  console.log("\n=== Phase 15: Swagger + API Explorer dry test ===\n");

  // ------------------------------------------------------------------
  // 1. Swagger UI page loads
  // ------------------------------------------------------------------
  console.log("Test: Swagger UI page");
  const swaggerRes = await fetch(`${SERVER_URL}/admin/api-docs`);
  assert(swaggerRes.status === 200, "Swagger UI returns 200");
  const swaggerHtml = await swaggerRes.text();
  assert(swaggerHtml.includes("swagger-ui"), "HTML contains swagger-ui");
  assert(swaggerHtml.includes("SwaggerUIBundle"), "HTML loads SwaggerUI JS");

  // ------------------------------------------------------------------
  // 2. OpenAPI spec
  // ------------------------------------------------------------------
  console.log("\nTest: OpenAPI spec");
  const specRes = await fetch(`${SERVER_URL}/admin/api-docs/spec.json`);
  assert(specRes.status === 200, "Spec returns 200");
  const spec = await specRes.json() as Record<string, unknown>;

  // ------------------------------------------------------------------
  // 3. Spec version
  // ------------------------------------------------------------------
  assert(spec.openapi === "3.1.0", `OpenAPI version: ${spec.openapi}`);

  // ------------------------------------------------------------------
  // 4. Spec has paths
  // ------------------------------------------------------------------
  console.log("\nTest: spec paths");
  const paths = spec.paths as Record<string, unknown>;
  assert(paths["/health"] != null, "Has /health path");
  assert(paths["/health/ready"] != null, "Has /health/ready path");
  assert(paths["/metrics"] != null, "Has /metrics path");
  assert(paths["/sse"] != null, "Has /sse path");
  assert(paths["/webhooks/{agentId}/sms"] != null, "Has SMS webhook path");
  assert(paths["/webhooks/{agentId}/voice"] != null, "Has voice webhook path");
  assert(paths["/admin/setup"] != null, "Has admin setup path");
  assert(paths["/admin/api-docs"] != null, "Has api-docs path");

  // ------------------------------------------------------------------
  // 5. MCP tools section
  // ------------------------------------------------------------------
  console.log("\nTest: MCP tools in spec");
  const mcpTools = (spec["x-mcp-tools"] || []) as Array<Record<string, unknown>>;
  assert(mcpTools.length > 0, `Has ${mcpTools.length} MCP tools documented`);
  const toolNames = mcpTools.map((t) => t.name as string);
  assert(toolNames.includes("comms_ping"), "Documents comms_ping");
  assert(toolNames.includes("comms_send_message"), "Documents comms_send_message");
  assert(toolNames.includes("comms_make_call"), "Documents comms_make_call");
  assert(toolNames.includes("comms_transfer_call"), "Documents comms_transfer_call");
  assert(toolNames.includes("comms_onboard_customer"), "Documents comms_onboard_customer");

  // ------------------------------------------------------------------
  // 6. Demo mode banner
  // ------------------------------------------------------------------
  console.log("\nTest: demo mode banner");
  assert(swaggerHtml.includes("DEMO MODE"), "Demo mode banner present");

  // ------------------------------------------------------------------
  // 7. Scenario runner
  // ------------------------------------------------------------------
  console.log("\nTest: scenario runner");
  const scenarioRes = await fetch(`${SERVER_URL}/admin/api/run-scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert(scenarioRes.status === 200, "Scenario runner returns 200");
  const scenarioData = await scenarioRes.json() as { results: Array<{ name: string; passed: boolean; detail: string }>; allPassed: boolean };

  // ------------------------------------------------------------------
  // 8. All scenarios pass
  // ------------------------------------------------------------------
  console.log("\nTest: scenario results");
  for (const r of scenarioData.results) {
    assert(r.passed, `Scenario: ${r.name} — ${r.detail}`);
  }
  assert(scenarioData.allPassed === true, "All scenarios passed");

  // ------------------------------------------------------------------
  // 9. Regression: setup page
  // ------------------------------------------------------------------
  console.log("\nTest: regression");
  const setupRes = await fetch(`${SERVER_URL}/admin/setup`);
  assert(setupRes.status === 200, "Setup page still loads");

  // ------------------------------------------------------------------
  // 10. Regression: health
  // ------------------------------------------------------------------
  const healthRes = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthRes.json() as Record<string, unknown>;
  assert(healthData.status === "ok", "Health check passes");

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
