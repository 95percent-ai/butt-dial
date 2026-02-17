/**
 * Dry test for Phase 3 — Inbound SMS webhook + comms_get_messages.
 *
 * Tests:
 * 1. POST simulated Twilio webhook to /webhooks/:agentId/sms
 * 2. Verify 200 response with TwiML
 * 3. Verify message stored in DB (direction: inbound)
 * 4. Call comms_get_messages via MCP, verify both outbound and inbound appear
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

  // ------------------------------------------------------------------
  // 2. Verify the message was stored in the database
  // ------------------------------------------------------------------
  console.log("\nTest: database record");

  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare(
    "SELECT * FROM messages WHERE external_id = ? AND direction = 'inbound'"
  ).get(testMessageSid) as Record<string, unknown> | undefined;

  assert(row !== undefined, "inbound message row exists in database");
  if (row) {
    assert(row.agent_id === "test-agent-001", "agent_id matches");
    assert(row.channel === "sms", "channel is 'sms'");
    assert(row.direction === "inbound", "direction is 'inbound'");
    assert(row.from_address === "+972526557547", "from_address matches sender");
    assert(row.to_address === agentPhone, "to_address matches agent's number");
    assert(row.body === "Hello from dry test — inbound", "body matches");
    assert(row.status === "received", "status is 'received'");
  }
  db.close();

  // ------------------------------------------------------------------
  // 3. Connect MCP client and test comms_get_messages
  // ------------------------------------------------------------------
  console.log("\nTest: comms_get_messages tool");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  // Verify tool is listed
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);
  assert(toolNames.includes("comms_get_messages"), "comms_get_messages is registered");

  // Call comms_get_messages
  const result = await client.callTool({
    name: "comms_get_messages",
    arguments: { agentId: "test-agent-001", limit: 50 },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  assert(Array.isArray(parsed.messages), "response has messages array");
  assert(parsed.count > 0, "count is > 0");

  const inbound = parsed.messages.find(
    (m: Record<string, unknown>) => m.direction === "inbound" && m.externalId === "SM_test_inbound_001"
  );
  assert(inbound !== undefined, "inbound message found in get_messages result");
  if (inbound) {
    assert(inbound.from === "+972526557547", "inbound from matches");
    assert(inbound.body === "Hello from dry test — inbound", "inbound body matches");
  }

  // Test with channel filter
  const smsResult = await client.callTool({
    name: "comms_get_messages",
    arguments: { agentId: "test-agent-001", limit: 50, channel: "sms" },
  });
  const smsParsed = JSON.parse(
    (smsResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(smsParsed.count > 0, "channel filter 'sms' returns results");

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

  // comms_get_messages for non-existent agent (should return empty, not error)
  const emptyResult = await client.callTool({
    name: "comms_get_messages",
    arguments: { agentId: "does-not-exist" },
  });
  const emptyParsed = JSON.parse(
    (emptyResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(emptyParsed.count === 0, "non-existent agent returns 0 messages");

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
