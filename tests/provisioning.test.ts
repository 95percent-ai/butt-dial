/**
 * Dry test for Phase 8 — Provisioning & Teardown.
 *
 * Tests:
 * 1. Tool discovery — 4 new tools registered
 * 2. Provision agent with all channels → success, DB record, pool updated, WhatsApp assigned
 * 3. Duplicate agent ID → error
 * 4. Get channel status → matches provisioned state
 * 5. Send message through provisioned agent → works
 * 6. Deprovision → success, DB status changed, pool decremented, WhatsApp returned
 * 7. Double deprovision → error
 * 8. Pool capacity test (fill pool → overflow error → deprovision → space opens)
 * 9. Register provider (exercise the flow)
 * 10. Regression: SMS + email + WhatsApp still work for test-agent-001
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/provisioning.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync } from "fs";

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
  console.log("\n=== Phase 8: Provisioning & Teardown dry test ===\n");

  // Clean up any leftovers from previous runs
  const setupDb = new Database(DB_PATH);
  setupDb.prepare("DELETE FROM messages WHERE agent_id IN ('test-provision-001', 'test-fill-pool', 'test-after-space')").run();
  setupDb.prepare("DELETE FROM agent_tokens WHERE agent_id IN ('test-provision-001', 'test-fill-pool', 'test-after-space')").run();
  setupDb.prepare("DELETE FROM spending_limits WHERE agent_id IN ('test-provision-001', 'test-fill-pool', 'test-after-space')").run();
  setupDb.prepare("DELETE FROM whatsapp_pool WHERE assigned_to_agent IN ('test-provision-001', 'test-fill-pool', 'test-after-space')").run();
  setupDb.prepare("DELETE FROM agent_channels WHERE agent_id IN ('test-provision-001', 'test-fill-pool', 'test-after-space')").run();
  setupDb.prepare("DELETE FROM whatsapp_pool WHERE id = 'wa-pool-test-001'").run();

  // Seed WhatsApp pool entry for testing
  setupDb.prepare(
    "INSERT OR IGNORE INTO whatsapp_pool (id, phone_number, sender_sid, status) VALUES (?, ?, ?, 'available')"
  ).run("wa-pool-test-001", "+15551234567", "WA_SENDER_TEST_001");
  // Ensure test-agent-001 has all fields for regression tests
  setupDb.prepare(
    "UPDATE agent_channels SET whatsapp_sender_sid = ?, email_address = ? WHERE agent_id = ?"
  ).run("+1234567890", "agent@test.example.com", "test-agent-001");
  // Ensure pool has room (reset to default)
  setupDb.prepare(
    "UPDATE agent_pool SET max_agents = 5 WHERE id = 'default'"
  ).run();
  setupDb.close();
  console.log("Setup: seeded whatsapp_pool, ensured test-agent-001 ready\n");

  // ------------------------------------------------------------------
  // 1. Connect MCP client + tool discovery
  // ------------------------------------------------------------------
  console.log("Test: tool discovery");

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);

  assert(toolNames.includes("comms_provision_channels"), "comms_provision_channels is registered");
  assert(toolNames.includes("comms_deprovision_channels"), "comms_deprovision_channels is registered");
  assert(toolNames.includes("comms_get_channel_status"), "comms_get_channel_status is registered");
  assert(toolNames.includes("comms_register_provider"), "comms_register_provider is registered");

  // ------------------------------------------------------------------
  // 2. Provision agent with all channels
  // ------------------------------------------------------------------
  console.log("\nTest: provision agent with all channels");

  // Record pool state before
  const dbBefore = new Database(DB_PATH, { readonly: true });
  const poolBefore = dbBefore.prepare("SELECT active_agents FROM agent_pool WHERE id = 'default'").get() as { active_agents: number };
  dbBefore.close();

  const provisionResult = await client.callTool({
    name: "comms_provision_channels",
    arguments: {
      agentId: "test-provision-001",
      displayName: "Provisioned Test Agent",
      greeting: "Hello, I'm a test agent",
      systemPrompt: "You are a helpful test agent.",
      country: "US",
      capabilities: {
        phone: true,
        whatsapp: true,
        email: true,
        voiceAi: true,
      },
      emailDomain: "test.example.com",
    },
  });

  const provParsed = callToolParsed(provisionResult);

  assert(provParsed.success === true, "provision returned success");
  assert(provParsed.agentId === "test-provision-001", "agentId matches");
  assert(provParsed.displayName === "Provisioned Test Agent", "displayName matches");

  const channels = provParsed.channels as Record<string, unknown>;
  assert(channels.phone !== null, "phone channel provisioned");
  assert(channels.email !== null, "email channel provisioned");
  assert(channels.voiceAi !== null, "voiceAi channel provisioned");

  const phoneInfo = channels.phone as Record<string, unknown>;
  assert(typeof phoneInfo.number === "string", "phone number is a string");
  assert(phoneInfo.status === "active", "phone status is active");

  const emailInfo = channels.email as Record<string, unknown>;
  assert((emailInfo.address as string).includes("test-provision-001@test.example.com"), "email address generated correctly");
  assert(emailInfo.status === "active", "email status is active");

  const waInfo = channels.whatsapp as Record<string, unknown>;
  assert(waInfo !== null, "WhatsApp channel present");
  assert(waInfo.status === "active", "WhatsApp status is active");
  assert(waInfo.number === "+15551234567", "WhatsApp number from pool");

  // Verify DB record
  console.log("\nTest: verify DB record after provision");

  const dbAfter = new Database(DB_PATH, { readonly: true });
  const agentRow = dbAfter.prepare(
    "SELECT * FROM agent_channels WHERE agent_id = ?"
  ).get("test-provision-001") as Record<string, unknown> | undefined;

  assert(agentRow !== undefined, "agent_channels row exists");
  if (agentRow) {
    assert(agentRow.status === "active", "DB status is active");
    assert(agentRow.display_name === "Provisioned Test Agent", "DB display_name matches");
    assert(typeof agentRow.phone_number === "string", "DB phone_number set");
    assert(agentRow.email_address === "test-provision-001@test.example.com", "DB email_address set");
    assert(agentRow.greeting === "Hello, I'm a test agent", "DB greeting set");
    assert(agentRow.system_prompt === "You are a helpful test agent.", "DB system_prompt set");
  }

  // Verify pool incremented
  const poolAfter = dbAfter.prepare("SELECT active_agents FROM agent_pool WHERE id = 'default'").get() as { active_agents: number };
  assert(poolAfter.active_agents === poolBefore.active_agents + 1, "pool active_agents incremented");

  // Verify WhatsApp pool entry assigned
  const waPoolRow = dbAfter.prepare(
    "SELECT * FROM whatsapp_pool WHERE id = 'wa-pool-test-001'"
  ).get() as Record<string, unknown>;
  assert(waPoolRow.status === "assigned", "WhatsApp pool entry marked as assigned");
  assert(waPoolRow.assigned_to_agent === "test-provision-001", "WhatsApp pool assigned to correct agent");

  dbAfter.close();

  // ------------------------------------------------------------------
  // 3. Duplicate agent ID → error
  // ------------------------------------------------------------------
  console.log("\nTest: duplicate agent ID");

  const dupResult = await client.callTool({
    name: "comms_provision_channels",
    arguments: {
      agentId: "test-provision-001",
      displayName: "Duplicate",
      capabilities: { phone: true },
    },
  });
  const dupParsed = callToolParsed(dupResult);
  assert(dupParsed.error !== undefined, "duplicate agent returns error");
  assert((dupParsed.error as string).includes("already exists"), "error mentions already exists");

  // ------------------------------------------------------------------
  // 4. Get channel status
  // ------------------------------------------------------------------
  console.log("\nTest: get channel status");

  const statusResult = await client.callTool({
    name: "comms_get_channel_status",
    arguments: { agentId: "test-provision-001" },
  });
  const statusParsed = callToolParsed(statusResult);

  assert(statusParsed.agentId === "test-provision-001", "status agentId matches");
  assert(statusParsed.status === "active", "status is active");

  const statusChannels = statusParsed.channels as Record<string, unknown>;
  assert(statusChannels.phone !== null, "status shows phone");
  assert(statusChannels.email !== null, "status shows email");
  assert(statusChannels.whatsapp !== null, "status shows whatsapp");
  assert(statusChannels.voiceAi !== null, "status shows voiceAi");

  const statusPool = statusParsed.pool as Record<string, unknown>;
  assert(typeof statusPool.slotsRemaining === "number", "pool slotsRemaining is a number");

  // ------------------------------------------------------------------
  // 5. Send message through provisioned agent
  // ------------------------------------------------------------------
  console.log("\nTest: send SMS through provisioned agent");

  const sendResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-provision-001",
      to: "+972526557547",
      body: "Hello from provisioned agent",
    },
  });
  const sendParsed = callToolParsed(sendResult);
  assert(sendParsed.success === true, "send SMS through provisioned agent works");

  // ------------------------------------------------------------------
  // 6. Deprovision
  // ------------------------------------------------------------------
  console.log("\nTest: deprovision agent");

  const deprovResult = await client.callTool({
    name: "comms_deprovision_channels",
    arguments: { agentId: "test-provision-001" },
  });
  const deprovParsed = callToolParsed(deprovResult);

  assert(deprovParsed.success === true, "deprovision returned success");
  assert(deprovParsed.status === "deprovisioned", "status is deprovisioned");
  assert(deprovParsed.numberReleased === true, "phone number released");
  assert(deprovParsed.whatsappReturned === true, "WhatsApp returned to pool");

  // Verify DB
  const dbDeprov = new Database(DB_PATH, { readonly: true });
  const deprovRow = dbDeprov.prepare(
    "SELECT status FROM agent_channels WHERE agent_id = ?"
  ).get("test-provision-001") as { status: string };
  assert(deprovRow.status === "deprovisioned", "DB status is deprovisioned");

  // Verify pool decremented
  const poolDeprov = dbDeprov.prepare("SELECT active_agents FROM agent_pool WHERE id = 'default'").get() as { active_agents: number };
  assert(poolDeprov.active_agents === poolBefore.active_agents, "pool active_agents back to original");

  // Verify WhatsApp returned to pool
  const waPoolAfterDeprov = dbDeprov.prepare(
    "SELECT * FROM whatsapp_pool WHERE id = 'wa-pool-test-001'"
  ).get() as Record<string, unknown>;
  assert(waPoolAfterDeprov.status === "available", "WhatsApp pool entry returned to available");
  assert(waPoolAfterDeprov.assigned_to_agent === null, "WhatsApp pool agent cleared");

  dbDeprov.close();

  // ------------------------------------------------------------------
  // 7. Double deprovision → error
  // ------------------------------------------------------------------
  console.log("\nTest: double deprovision");

  const doubleDeprov = await client.callTool({
    name: "comms_deprovision_channels",
    arguments: { agentId: "test-provision-001" },
  });
  const doubleParsed = callToolParsed(doubleDeprov);
  assert(doubleParsed.error !== undefined, "double deprovision returns error");
  assert((doubleParsed.error as string).includes("already deprovisioned"), "error mentions already deprovisioned");

  // ------------------------------------------------------------------
  // 8. Pool capacity test
  // ------------------------------------------------------------------
  console.log("\nTest: pool capacity enforcement");

  // Set pool to very small size
  const poolDb = new Database(DB_PATH);
  const currentActive = (poolDb.prepare("SELECT active_agents FROM agent_pool WHERE id = 'default'").get() as { active_agents: number }).active_agents;
  poolDb.prepare("UPDATE agent_pool SET max_agents = ? WHERE id = 'default'").run(currentActive + 1);
  poolDb.close();

  // Provision one agent to fill the pool
  const fillResult = await client.callTool({
    name: "comms_provision_channels",
    arguments: {
      agentId: "test-fill-pool",
      displayName: "Pool Filler",
      capabilities: { phone: true },
    },
  });
  const fillParsed = callToolParsed(fillResult);
  assert(fillParsed.success === true, "pool filler provisioned");

  // Try one more — should fail
  const overflowResult = await client.callTool({
    name: "comms_provision_channels",
    arguments: {
      agentId: "test-overflow",
      displayName: "Overflow Agent",
      capabilities: { phone: true },
    },
  });
  const overflowParsed = callToolParsed(overflowResult);
  assert(overflowParsed.error !== undefined, "pool overflow returns error");
  assert((overflowParsed.error as string).includes("pool is full"), "error mentions pool is full");

  // Deprovision to make space
  const deprovFillResult = await client.callTool({
    name: "comms_deprovision_channels",
    arguments: { agentId: "test-fill-pool" },
  });
  const deprovFillParsed = callToolParsed(deprovFillResult);
  assert(deprovFillParsed.success === true, "pool filler deprovisioned");

  // Now should succeed
  const afterSpaceResult = await client.callTool({
    name: "comms_provision_channels",
    arguments: {
      agentId: "test-after-space",
      displayName: "After Space Agent",
      capabilities: { phone: true },
    },
  });
  const afterSpaceParsed = callToolParsed(afterSpaceResult);
  assert(afterSpaceParsed.success === true, "provision succeeds after making space");

  // Clean up this agent
  await client.callTool({
    name: "comms_deprovision_channels",
    arguments: { agentId: "test-after-space" },
  });

  // ------------------------------------------------------------------
  // 9. Register provider (exercise the flow — skipping live verify)
  //    Back up .env so real credentials are never lost.
  // ------------------------------------------------------------------
  console.log("\nTest: register provider");

  const envPath = path.join(__dirname, "..", ".env");
  let envBackup: string | null = null;
  if (existsSync(envPath)) {
    envBackup = readFileSync(envPath, "utf-8");
  }

  try {
    const regResult = await client.callTool({
      name: "comms_register_provider",
      arguments: {
        provider: "twilio",
        credentials: {
          accountSid: "ACtest123456789",
          authToken: "test_auth_token_value",
        },
        autoVerify: false,
      },
    });
    const regParsed = callToolParsed(regResult);
    assert(regParsed.success === true, "register provider returned success");
    assert((regParsed.capabilities as string[]).includes("sms"), "capabilities include sms");
    assert((regParsed.envKeysWritten as string[]).includes("TWILIO_ACCOUNT_SID"), "TWILIO_ACCOUNT_SID written");
    assert((regParsed.note as string).includes("Restart"), "note mentions restart");

    // Test unknown credential keys
    const badKeysResult = await client.callTool({
      name: "comms_register_provider",
      arguments: {
        provider: "twilio",
        credentials: { unknownKey: "value" },
        autoVerify: false,
      },
    });
    const badKeysParsed = callToolParsed(badKeysResult);
    assert(badKeysParsed.error !== undefined, "unknown credential keys return error");
  } finally {
    // Restore .env so real credentials are preserved
    if (envBackup !== null) {
      writeFileSync(envPath, envBackup, "utf-8");
      console.log("  (restored .env after register_provider test)");
    }
  }

  // ------------------------------------------------------------------
  // 10. Regression: SMS + email + WhatsApp still work for test-agent-001
  // ------------------------------------------------------------------
  console.log("\nTest: SMS regression");

  const smsRegResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Phase 8 regression — SMS",
    },
  });
  const smsRegParsed = callToolParsed(smsRegResult);
  assert(smsRegParsed.success === true, "SMS regression passes");

  console.log("\nTest: email regression");

  const emailRegResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "human@example.com",
      body: "Phase 8 regression — email",
      channel: "email",
      subject: "Regression",
    },
  });
  const emailRegParsed = callToolParsed(emailRegResult);
  assert(emailRegParsed.success === true, "email regression passes");

  console.log("\nTest: WhatsApp regression");

  const waRegResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Phase 8 regression — WhatsApp",
      channel: "whatsapp",
    },
  });
  const waRegParsed = callToolParsed(waRegResult);
  assert(waRegParsed.success === true, "WhatsApp regression passes");

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  await client.close();

  const cleanDb = new Database(DB_PATH);
  // Remove FK dependents for test agents first
  cleanDb.prepare("DELETE FROM messages WHERE agent_id IN (?, ?, ?)").run(
    "test-provision-001", "test-fill-pool", "test-after-space"
  );
  cleanDb.prepare("DELETE FROM agent_tokens WHERE agent_id IN (?, ?, ?)").run(
    "test-provision-001", "test-fill-pool", "test-after-space"
  );
  cleanDb.prepare("DELETE FROM spending_limits WHERE agent_id IN (?, ?, ?)").run(
    "test-provision-001", "test-fill-pool", "test-after-space"
  );
  // Remove test agents
  cleanDb.prepare("DELETE FROM agent_channels WHERE agent_id IN (?, ?, ?)").run(
    "test-provision-001", "test-fill-pool", "test-after-space"
  );
  // Remove test WhatsApp pool entry
  cleanDb.prepare("DELETE FROM whatsapp_pool WHERE id = ?").run("wa-pool-test-001");
  // Restore pool max_agents
  cleanDb.prepare("UPDATE agent_pool SET max_agents = 5 WHERE id = 'default'").run();
  cleanDb.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
