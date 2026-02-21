/**
 * Dry test for Phase 3 — Inbound SMS webhook + comms_get_messages.
 *
 * Tests:
 * 1. POST simulated Twilio webhook to /webhooks/:agentId/sms
 * 2. Verify 200 response with TwiML
 * 3. Verify webhook processed correctly (no longer stored to messages table)
 * 5. Error cases: unknown agent, missing body fields
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/inbound-sms.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
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

async function main() {
  console.log("\n=== Phase 3: Inbound SMS dry test ===\n");

  // Read the agent's actual phone number from DB (may differ from seed default)
  const setupDb = new Database(DB_PATH, { readonly: true });
  const agentRow = setupDb.prepare(
    "SELECT phone_number FROM agent_channels WHERE agent_id = 'test-agent-001'"
  ).get() as { phone_number: string } | undefined;
  setupDb.close();

  const agentPhone = agentRow?.phone_number ?? "+1234567890";
  console.log(`Agent phone number: ${agentPhone}\n`);

  // ------------------------------------------------------------------
  // 1. Send a simulated Twilio webhook POST
  // ------------------------------------------------------------------
  console.log("Test: inbound SMS webhook (valid agent)");

  const testMessageSid = `SM_test_inbound_${randomUUID().slice(0, 8)}`;
  const twilioBody = new URLSearchParams({
    MessageSid: testMessageSid,
    From: "+972526557547",
    To: agentPhone,
    Body: "Hello from dry test — inbound",
    NumMedia: "0",
  });

  const webhookResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: twilioBody.toString(),
  });

  assert(webhookResp.status === 200, "webhook returns 200");

  const twiml = await webhookResp.text();
  assert(twiml === "<Response/>", "response is empty TwiML <Response/>");

  // Inbound webhooks no longer store to messages table (forwarded to agent callback)
  // The 200 response + TwiML above confirms the webhook was processed

  // ------------------------------------------------------------------
  // 2. Connect MCP client and verify tools
  // ------------------------------------------------------------------
  console.log("\nTest: comms_get_waiting_messages tool");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  // Verify new tool is listed (replaces comms_get_messages)
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);
  assert(toolNames.includes("comms_get_waiting_messages"), "comms_get_waiting_messages is registered");
  assert(!toolNames.includes("comms_get_messages"), "comms_get_messages is removed");

  // ------------------------------------------------------------------
  // 4. Error cases
  // ------------------------------------------------------------------
  console.log("\nTest: webhook error cases");

  // Unknown agent
  const unknownResp = await fetch(`${SERVER_URL}/webhooks/does-not-exist/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MessageSid: "SM_unknown",
      From: "+972526557547",
      To: "+9999999999",
      Body: "Should fail",
    }).toString(),
  });
  assert(unknownResp.status === 404, "unknown agent returns 404");

  // Missing required fields (no From/To)
  const missingResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MessageSid: "SM_missing",
      Body: "No from or to",
    }).toString(),
  });
  assert(missingResp.status === 400, "missing fields returns 400");

  // comms_get_waiting_messages for non-existent agent (should return empty, not error)
  const emptyResult = await client.callTool({
    name: "comms_get_waiting_messages",
    arguments: { agentId: "does-not-exist" },
  });
  const emptyParsed = JSON.parse(
    (emptyResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(emptyParsed.count === 0, "non-existent agent returns 0 waiting messages");

  // ------------------------------------------------------------------
  // 5. Cleanup
  // ------------------------------------------------------------------
  await client.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
