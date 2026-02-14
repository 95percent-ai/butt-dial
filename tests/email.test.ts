/**
 * Dry test for Phase 6 — Email channel (send + receive).
 *
 * Tests:
 * 1. comms_send_message with channel: "email" — verify mock success
 * 2. Verify message stored in DB (channel: email, direction: outbound)
 * 3. POST simulated Resend inbound webhook — verify stored in DB
 * 4. comms_get_messages with channel filter "email" — verify both directions
 * 5. Error cases: agent without email, missing subject
 * 6. Regression: SMS still works
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/email.test.ts
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

async function main() {
  console.log("\n=== Phase 6: Email channel dry test ===\n");

  // Ensure test agent has an email address
  const setupDb = new Database(DB_PATH);
  setupDb.prepare(
    "UPDATE agent_channels SET email_address = ? WHERE agent_id = ?"
  ).run("agent@test.example.com", "test-agent-001");
  setupDb.close();
  console.log("Set test agent email to agent@test.example.com\n");

  // ------------------------------------------------------------------
  // 1. Connect MCP client
  // ------------------------------------------------------------------
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  // Verify tool is listed with new params
  const { tools } = await client.listTools();
  const sendTool = tools.find((t) => t.name === "comms_send_message");
  assert(sendTool !== undefined, "comms_send_message is registered");

  // ------------------------------------------------------------------
  // 2. Send email via MCP tool
  // ------------------------------------------------------------------
  console.log("\nTest: send email via comms_send_message");

  const emailResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "human@example.com",
      body: "Hello from Phase 6 dry test",
      channel: "email",
      subject: "Test Email Subject",
    },
  });

  const emailText = (emailResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const emailParsed = JSON.parse(emailText);

  assert(emailParsed.success === true, "email send returned success");
  assert(emailParsed.channel === "email", "response channel is email");
  assert(emailParsed.from === "agent@test.example.com", "from is agent email");
  assert(emailParsed.to === "human@example.com", "to is recipient email");
  assert(emailParsed.subject === "Test Email Subject", "subject echoed back");
  assert(typeof emailParsed.externalId === "string", "externalId is present");
  assert(emailParsed.status === "sent", "status is sent");

  // ------------------------------------------------------------------
  // 3. Verify outbound email in DB
  // ------------------------------------------------------------------
  console.log("\nTest: outbound email in database");

  const db = new Database(DB_PATH, { readonly: true });
  const outbound = db.prepare(
    "SELECT * FROM messages WHERE agent_id = ? AND channel = 'email' AND direction = 'outbound' ORDER BY created_at DESC LIMIT 1"
  ).get("test-agent-001") as Record<string, unknown> | undefined;

  assert(outbound !== undefined, "outbound email row exists in database");
  if (outbound) {
    assert(outbound.channel === "email", "channel is email");
    assert(outbound.direction === "outbound", "direction is outbound");
    assert(outbound.from_address === "agent@test.example.com", "from_address is agent email");
    assert(outbound.to_address === "human@example.com", "to_address is recipient");
    assert((outbound.body as string).includes("Test Email Subject"), "body includes subject");
    assert((outbound.body as string).includes("Hello from Phase 6 dry test"), "body includes message text");
  }

  // ------------------------------------------------------------------
  // 4. Simulate inbound email webhook
  // ------------------------------------------------------------------
  console.log("\nTest: inbound email webhook");

  const webhookResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "email.received",
      data: {
        email_id: "resend_test_inbound_001",
        from: "human@example.com",
        to: "agent@test.example.com",
        subject: "Reply from human",
        text: "This is a reply to the agent",
      },
    }),
  });

  assert(webhookResp.status === 200, "webhook returns 200");

  const webhookBody = await webhookResp.json();
  assert((webhookBody as { ok: boolean }).ok === true, "webhook body is { ok: true }");

  // Verify inbound email in DB
  console.log("\nTest: inbound email in database");

  const db2 = new Database(DB_PATH, { readonly: true });
  const inbound = db2.prepare(
    "SELECT * FROM messages WHERE external_id = ? AND direction = 'inbound'"
  ).get("resend_test_inbound_001") as Record<string, unknown> | undefined;

  assert(inbound !== undefined, "inbound email row exists in database");
  if (inbound) {
    assert(inbound.agent_id === "test-agent-001", "agent_id matches");
    assert(inbound.channel === "email", "channel is email");
    assert(inbound.direction === "inbound", "direction is inbound");
    assert(inbound.from_address === "human@example.com", "from_address is sender");
    assert(inbound.to_address === "agent@test.example.com", "to_address is agent email");
    assert((inbound.body as string).includes("Reply from human"), "body includes subject");
    assert((inbound.body as string).includes("This is a reply to the agent"), "body includes text");
    assert(inbound.status === "received", "status is received");
  }
  db2.close();

  // ------------------------------------------------------------------
  // 5. Get messages with email filter
  // ------------------------------------------------------------------
  console.log("\nTest: comms_get_messages with email filter");

  const getResult = await client.callTool({
    name: "comms_get_messages",
    arguments: { agentId: "test-agent-001", limit: 50, channel: "email" },
  });

  const getParsed = JSON.parse(
    (getResult.content as Array<{ type: string; text: string }>)[0]?.text
  );

  assert(getParsed.count >= 2, "at least 2 email messages (outbound + inbound)");

  const outboundMsg = getParsed.messages.find(
    (m: Record<string, unknown>) => m.direction === "outbound" && m.channel === "email"
  );
  assert(outboundMsg !== undefined, "outbound email found via get_messages");

  const inboundMsg = getParsed.messages.find(
    (m: Record<string, unknown>) => m.direction === "inbound" && m.externalId === "resend_test_inbound_001"
  );
  assert(inboundMsg !== undefined, "inbound email found via get_messages");

  // ------------------------------------------------------------------
  // 6. Error cases
  // ------------------------------------------------------------------
  console.log("\nTest: error cases");

  // Missing subject for email
  const noSubjectResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "human@example.com",
      body: "No subject",
      channel: "email",
    },
  });
  const noSubjectParsed = JSON.parse(
    (noSubjectResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(noSubjectParsed.error !== undefined, "missing subject returns error");
  assert(noSubjectParsed.error.includes("Subject"), "error mentions subject");

  // Agent without email address — use a temp agent without email
  const tempDb = new Database(DB_PATH);
  tempDb.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, phone_number, status) VALUES (?, ?, ?, ?, 'active')"
  ).run("temp-no-email-id", "temp-no-email", "No Email Agent", "+15550000000");
  tempDb.close();

  const noEmailResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "temp-no-email",
      to: "human@example.com",
      body: "Should fail",
      channel: "email",
      subject: "Test",
    },
  });
  const noEmailParsed = JSON.parse(
    (noEmailResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(noEmailParsed.error !== undefined, "agent without email returns error");
  assert(noEmailParsed.error.includes("no email"), "error mentions no email address");

  // Webhook with unknown agent
  const unknownResp = await fetch(`${SERVER_URL}/webhooks/does-not-exist/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "email.received",
      data: {
        email_id: "resend_unknown",
        from: "human@example.com",
        to: "nobody@example.com",
        subject: "Unknown",
        text: "Should fail",
      },
    }),
  });
  assert(unknownResp.status === 404, "unknown agent webhook returns 404");

  // Webhook with missing fields
  const missingResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email.received", data: {} }),
  });
  assert(missingResp.status === 400, "missing fields webhook returns 400");

  // ------------------------------------------------------------------
  // 7. Regression: SMS still works
  // ------------------------------------------------------------------
  console.log("\nTest: SMS regression");

  const smsResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Regression test — SMS still works",
    },
  });
  const smsParsed = JSON.parse(
    (smsResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(smsParsed.success === true, "SMS send still works (regression)");
  assert(smsParsed.channel === "sms", "SMS channel confirmed");

  // SMS with explicit channel param
  const smsExplicit = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Explicit SMS channel",
      channel: "sms",
    },
  });
  const smsExplicitParsed = JSON.parse(
    (smsExplicit.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(smsExplicitParsed.success === true, "explicit channel: sms still works");

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  await client.close();
  db.close();

  // Remove temp agent
  const cleanDb = new Database(DB_PATH);
  cleanDb.prepare("DELETE FROM agent_channels WHERE agent_id = ?").run("temp-no-email");
  cleanDb.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
