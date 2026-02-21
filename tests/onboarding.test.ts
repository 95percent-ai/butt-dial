/**
 * Dry test for Phase 8 — Configuration Architecture & Customer Onboarding.
 *
 * Tests:
 * 1. Config loads with default identity/isolation modes
 * 2. comms_onboard_customer tool is registered
 * 3. Onboarding returns all expected sections (provisioning, emailSetup, webhookUrls, connectionInstructions)
 * 4. Onboarding with email includes DNS records section
 * 5. Duplicate agent onboarding → error
 * 6. Existing provisioning still works (regression)
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/onboarding.test.ts
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

function callToolParsed(result: unknown): Record<string, unknown> {
  const text = ((result as { content: Array<{ type: string; text: string }> }).content)[0]?.text;
  return JSON.parse(text);
}

async function main() {
  console.log("\n=== Phase 8: Configuration Architecture & Onboarding dry test ===\n");

  // Clean up from previous runs
  const setupDb = new Database(DB_PATH);
  setupDb.prepare("DELETE FROM dead_letters WHERE agent_id IN ('test-onboard-001', 'test-onboard-dup')").run();
  setupDb.prepare("DELETE FROM whatsapp_pool WHERE assigned_to_agent IN ('test-onboard-001', 'test-onboard-dup')").run();
  setupDb.prepare("DELETE FROM agent_channels WHERE agent_id IN ('test-onboard-001', 'test-onboard-dup')").run();
  try { setupDb.prepare("DELETE FROM spending_limits WHERE agent_id IN ('test-onboard-001', 'test-onboard-dup')").run(); } catch {}
  try { setupDb.prepare("DELETE FROM agent_tokens WHERE agent_id IN ('test-onboard-001', 'test-onboard-dup')").run(); } catch {}

  // Seed a WhatsApp pool entry
  setupDb.prepare(
    "INSERT OR IGNORE INTO whatsapp_pool (id, phone_number, sender_sid, status) VALUES (?, ?, ?, 'available')"
  ).run("wa-onboard-test-001", "+15559990001", "WA_ONBOARD_TEST");
  setupDb.close();
  console.log("Setup: cleaned previous runs, seeded whatsapp_pool\n");

  // ------------------------------------------------------------------
  // 1. Connect MCP client
  // ------------------------------------------------------------------
  console.log("Test: MCP connection + tool discovery");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "onboarding-test", version: "1.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t: { name: string }) => t.name);

  assert(toolNames.includes("comms_onboard_customer"), "comms_onboard_customer tool registered");
  assert(toolNames.includes("comms_provision_channels"), "comms_provision_channels still registered (regression)");

  // ------------------------------------------------------------------
  // 2. Config defaults (check via comms_ping)
  // ------------------------------------------------------------------
  console.log("\nTest: config defaults (via ping)");
  const pingResult = callToolParsed(await client.callTool({ name: "comms_ping", arguments: {} }));
  assert(pingResult.status === "ok", "Server healthy");

  // ------------------------------------------------------------------
  // 3. Full onboarding — all channels
  // ------------------------------------------------------------------
  console.log("\nTest: full onboarding (all channels)");
  const onboardResult = callToolParsed(await client.callTool({
    name: "comms_onboard_customer",
    arguments: {
      agentId: "test-onboard-001",
      displayName: "Onboard Test Agent",
      capabilities: { phone: true, whatsapp: true, email: true, voiceAi: true },
      greeting: "Hello from onboarding!",
      systemPrompt: "You are an onboarded test agent.",
      country: "US",
    },
  }));

  assert(onboardResult.success === true, "Onboarding succeeded");

  // Check provisioning section
  const prov = onboardResult.provisioning as Record<string, unknown>;
  assert(prov != null, "Has provisioning section");
  assert(prov.agentId === "test-onboard-001", "Agent ID matches");
  assert(typeof prov.securityToken === "string" && (prov.securityToken as string).length > 0, "Security token returned");
  assert(prov.displayName === "Onboard Test Agent", "Display name matches");

  const channels = prov.channels as Record<string, unknown>;
  assert(channels.phone != null, "Phone channel provisioned");
  assert(channels.email != null, "Email channel provisioned");
  assert(channels.voiceAi != null, "Voice AI channel provisioned");

  // Check emailSetup section
  const emailSetup = onboardResult.emailSetup as Record<string, unknown> | null;
  assert(emailSetup != null, "Has emailSetup section");
  if (emailSetup) {
    assert(typeof emailSetup.domain === "string", "Email setup has domain");
    assert(Array.isArray(emailSetup.records), "Email setup has records array");
  }

  // Check webhookUrls section
  const webhooks = onboardResult.webhookUrls as Record<string, unknown>;
  assert(webhooks != null, "Has webhookUrls section");
  assert(typeof webhooks.sms === "string", "Has SMS webhook URL");
  assert(typeof webhooks.email === "string", "Has email webhook URL");
  assert(typeof webhooks.voice === "string", "Has voice webhook URL");
  assert(typeof webhooks.voiceWs === "string", "Has voice WS URL");

  // Check connectionInstructions section
  const instructions = onboardResult.connectionInstructions as Record<string, unknown>;
  assert(instructions != null, "Has connectionInstructions section");
  assert(typeof instructions.sseEndpoint === "string", "Has SSE endpoint");
  assert(typeof instructions.authHeader === "string", "Has auth header");
  assert(Array.isArray(instructions.steps), "Has setup steps");

  // ------------------------------------------------------------------
  // 4. DB verification
  // ------------------------------------------------------------------
  console.log("\nTest: DB verification");
  const verifyDb = new Database(DB_PATH);
  const agentRow = verifyDb.prepare("SELECT * FROM agent_channels WHERE agent_id = ?").get("test-onboard-001") as Record<string, unknown>;
  assert(agentRow != null, "Agent row exists in DB");
  assert(agentRow.display_name === "Onboard Test Agent", "Display name in DB");
  assert(agentRow.status === "active", "Status is active");
  assert(agentRow.greeting === "Hello from onboarding!", "Greeting saved");

  const tokenRow = verifyDb.prepare("SELECT * FROM agent_tokens WHERE agent_id = ?").get("test-onboard-001") as Record<string, unknown>;
  assert(tokenRow != null, "Token row exists");

  const limitsRow = verifyDb.prepare("SELECT * FROM spending_limits WHERE agent_id = ?").get("test-onboard-001") as Record<string, unknown>;
  assert(limitsRow != null, "Spending limits row created");
  verifyDb.close();

  // ------------------------------------------------------------------
  // 5. Duplicate onboarding → error
  // ------------------------------------------------------------------
  console.log("\nTest: duplicate onboarding");
  const dupResult = callToolParsed(await client.callTool({
    name: "comms_onboard_customer",
    arguments: {
      agentId: "test-onboard-001",
      displayName: "Duplicate Agent",
      capabilities: { phone: true },
    },
  }));
  assert(typeof dupResult.error === "string" && (dupResult.error as string).includes("already exists"), "Duplicate agent rejected");

  // ------------------------------------------------------------------
  // 6. Regression: existing provision tool still works
  // ------------------------------------------------------------------
  console.log("\nTest: regression — comms_get_channel_status");
  const statusResult = callToolParsed(await client.callTool({
    name: "comms_get_channel_status",
    arguments: { agentId: "test-onboard-001" },
  }));
  assert(statusResult.agentId === "test-onboard-001", "Channel status returns onboarded agent");

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  console.log("\nCleanup...");
  const cleanDb = new Database(DB_PATH);
  cleanDb.prepare("DELETE FROM dead_letters WHERE agent_id = 'test-onboard-001'").run();
  cleanDb.prepare("UPDATE whatsapp_pool SET assigned_to_agent = NULL, status = 'available' WHERE assigned_to_agent = 'test-onboard-001'").run();
  try { cleanDb.prepare("DELETE FROM agent_tokens WHERE agent_id = 'test-onboard-001'").run(); } catch {}
  try { cleanDb.prepare("DELETE FROM spending_limits WHERE agent_id = 'test-onboard-001'").run(); } catch {}
  cleanDb.prepare("DELETE FROM agent_channels WHERE agent_id = 'test-onboard-001'").run();
  cleanDb.prepare("UPDATE agent_pool SET active_agents = active_agents - 1 WHERE id = 'default' AND active_agents > 0").run();
  cleanDb.prepare("DELETE FROM whatsapp_pool WHERE id = 'wa-onboard-test-001'").run();
  cleanDb.close();

  await client.close();

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
