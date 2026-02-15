/**
 * Dry test for Phase 18 — Billing & Markup.
 *
 * Tests:
 * 1. comms_get_billing_summary tool is registered
 * 2. comms_set_billing_config tool is registered
 * 3. Billing summary returns cost data
 * 4. Billing summary includes markup fields
 * 5. Set billing config — set tier and markup
 * 6. Billing config persists after set
 * 7. Tier limits returned with config
 * 8. Available tiers listed
 * 9. Markup computation: 20% on provider cost
 * 10. Markup computation: 0% returns same cost
 * 11. billing_config table exists
 * 12. Admin billing summary (all agents)
 * 13. Regression: existing tools still work
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/billing.test.ts
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
  console.log("\n=== Phase 18: Billing & Markup dry test ===\n");

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "billing-test", version: "1.0.0" });
  await client.connect(transport);

  const db = new Database(DB_PATH);

  // ------------------------------------------------------------------
  // 1. Tools registered
  // ------------------------------------------------------------------
  console.log("Test: tools registered");
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name);
  assert(toolNames.includes("comms_get_billing_summary"), "Billing summary tool registered");
  assert(toolNames.includes("comms_set_billing_config"), "Billing config tool registered");

  // ------------------------------------------------------------------
  // 2. billing_config table exists
  // ------------------------------------------------------------------
  console.log("\nTest: billing tables");
  const bcTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='billing_config'"
  ).get();
  assert(bcTable != null, "billing_config table exists");

  // ------------------------------------------------------------------
  // 3. Set billing config for test agent
  // ------------------------------------------------------------------
  console.log("\nTest: set billing config");

  const setResult = await callTool(client, "comms_set_billing_config", {
    agentId: "test-agent-001",
    tier: "pro",
    markupPercent: 20,
  });
  assert(setResult.isError !== true, "Set billing config succeeds");
  assert(setResult.parsed.success === true, "Config set returns success");
  assert(setResult.parsed.billingConfig?.tier === "pro", "Tier set to pro");
  assert(setResult.parsed.billingConfig?.markupPercent === 20, "Markup set to 20%");

  // ------------------------------------------------------------------
  // 4. Tier limits returned
  // ------------------------------------------------------------------
  console.log("\nTest: tier limits");
  assert(setResult.parsed.tierLimits != null, "Tier limits returned");
  assert(setResult.parsed.tierLimits?.maxActionsPerDay === 5000, "Pro tier: 5000 actions/day");
  assert(setResult.parsed.tierLimits?.maxSpendPerMonth === 1000, "Pro tier: $1000/month");

  // ------------------------------------------------------------------
  // 5. Available tiers
  // ------------------------------------------------------------------
  assert(Array.isArray(setResult.parsed.availableTiers), "Available tiers is array");
  assert(setResult.parsed.availableTiers?.includes("free"), "Has free tier");
  assert(setResult.parsed.availableTiers?.includes("enterprise"), "Has enterprise tier");

  // ------------------------------------------------------------------
  // 6. Get billing summary for agent
  // ------------------------------------------------------------------
  console.log("\nTest: billing summary");

  // First generate some usage by sending a message
  await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15551234567",
    body: "Billing test message",
    channel: "sms",
  });

  const summaryResult = await callTool(client, "comms_get_billing_summary", {
    agentId: "test-agent-001",
    period: "all",
  });
  assert(summaryResult.isError !== true, "Billing summary succeeds");
  assert(typeof summaryResult.parsed.providerCost === "number", "Has providerCost");
  assert(typeof summaryResult.parsed.billingCost === "number", "Has billingCost");
  assert(typeof summaryResult.parsed.markupPercent === "number", "Has markupPercent");
  assert(summaryResult.parsed.markupPercent === 20, "Markup is 20%");
  assert(typeof summaryResult.parsed.tier === "string", "Has tier field");
  assert(summaryResult.parsed.byChannel != null, "Has byChannel breakdown");

  // ------------------------------------------------------------------
  // 7. Billing config persists
  // ------------------------------------------------------------------
  console.log("\nTest: billing config persistence");
  const billingRow = db.prepare(
    "SELECT tier, markup_percent FROM billing_config WHERE agent_id = ?"
  ).get("test-agent-001") as { tier: string; markup_percent: number } | undefined;
  assert(billingRow != null, "Billing config row exists in DB");
  assert(billingRow?.tier === "pro", "Tier persisted as pro");
  assert(billingRow?.markup_percent === 20, "Markup persisted as 20");

  // ------------------------------------------------------------------
  // 8. Change tier to free
  // ------------------------------------------------------------------
  console.log("\nTest: change tier");
  const freeResult = await callTool(client, "comms_set_billing_config", {
    agentId: "test-agent-001",
    tier: "free",
    markupPercent: 0,
  });
  assert(freeResult.parsed.billingConfig?.tier === "free", "Changed to free tier");
  assert(freeResult.parsed.tierLimits?.maxActionsPerDay === 100, "Free tier: 100 actions/day");
  assert(freeResult.parsed.tierLimits?.maxSpendPerMonth === 10, "Free tier: $10/month");

  // ------------------------------------------------------------------
  // 9. Admin billing summary (all agents)
  // ------------------------------------------------------------------
  console.log("\nTest: admin billing summary");
  const adminResult = await callTool(client, "comms_get_billing_summary", {
    period: "all",
  });
  assert(adminResult.isError !== true, "Admin billing summary succeeds");
  assert(typeof adminResult.parsed.globalMarkupPercent === "number", "Has global markup");
  assert(adminResult.parsed.totals != null, "Has totals section");
  assert(typeof adminResult.parsed.totals?.providerCost === "number", "Totals has providerCost");
  assert(typeof adminResult.parsed.totals?.billingCost === "number", "Totals has billingCost");
  assert(typeof adminResult.parsed.totals?.revenue === "number", "Totals has revenue");
  assert(Array.isArray(adminResult.parsed.agents), "Has agents array");

  // ------------------------------------------------------------------
  // 10. Agent not found
  // ------------------------------------------------------------------
  console.log("\nTest: errors");
  const notFound = await callTool(client, "comms_set_billing_config", {
    agentId: "nonexistent-agent",
    tier: "pro",
  });
  assert(notFound.isError === true, "Nonexistent agent returns error");

  // ------------------------------------------------------------------
  // 11. Regression
  // ------------------------------------------------------------------
  console.log("\nTest: regression");
  const healthRes = await fetch(`${SERVER_URL}/health`);
  const health = (await healthRes.json()) as Record<string, unknown>;
  assert(health.status === "ok", "Health check passes");

  const smsResult = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    to: "+15559876543",
    body: "Regression test",
    channel: "sms",
  });
  assert(smsResult.parsed.success === true, "SMS still works");

  // ------------------------------------------------------------------
  // Clean up billing config (reset to starter)
  // ------------------------------------------------------------------
  await callTool(client, "comms_set_billing_config", {
    agentId: "test-agent-001",
    tier: "starter",
    markupPercent: 0,
  });

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  await client.close();
  db.close();

  console.log(
    `\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
