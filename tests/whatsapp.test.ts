/**
 * Dry test for Phase 7 — WhatsApp channel (send + receive + templates).
 *
 * Tests:
 * 1. comms_send_message with channel: "whatsapp" — verify mock success
 * 2. Verify action logged in usage_logs
 * 3. Send with templateId + templateVars — verify success
 * 4. POST simulated Twilio inbound WhatsApp webhook — verify 200 response
 * 6. Error case: agent without whatsapp_sender_sid
 * 7. Regression: SMS + email still work
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/whatsapp.test.ts
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
  console.log("\n=== Phase 7: WhatsApp channel dry test ===\n");

  // Ensure test agent has whatsapp_sender_sid and email
  const setupDb = new Database(DB_PATH);
  setupDb.prepare(
    "UPDATE agent_channels SET whatsapp_sender_sid = ?, email_address = ? WHERE agent_id = ?"
  ).run("+1234567890", "agent@test.example.com", "test-agent-001");
  setupDb.close();
  console.log("Set test agent whatsapp_sender_sid to +1234567890\n");

  // ------------------------------------------------------------------
  // 1. Connect MCP client
  // ------------------------------------------------------------------
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  // Verify tool has whatsapp in channel enum
  const { tools } = await client.listTools();
  const sendTool = tools.find((t) => t.name === "comms_send_message");
  assert(sendTool !== undefined, "comms_send_message is registered");

  // ------------------------------------------------------------------
  // 2. Send WhatsApp message via MCP tool
  // ------------------------------------------------------------------
  console.log("\nTest: send WhatsApp via comms_send_message");

  const waResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Hello from Phase 7 WhatsApp dry test",
      channel: "whatsapp",
    },
  });

  const waText = (waResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const waParsed = JSON.parse(waText);

  assert(waParsed.success === true, "WhatsApp send returned success");
  assert(waParsed.channel === "whatsapp", "response channel is whatsapp");
  assert(waParsed.from === "+1234567890", "from is agent whatsapp number");
  assert(waParsed.to === "+972526557547", "to is recipient number");
  assert(typeof waParsed.externalId === "string", "externalId is present");
  assert(waParsed.status === "sent", "status is sent");

  // ------------------------------------------------------------------
  // 3. Verify outbound WhatsApp in usage_logs
  // ------------------------------------------------------------------
  console.log("\nTest: outbound WhatsApp in usage_logs");

  const db = new Database(DB_PATH, { readonly: true });
  const logRow = db.prepare(
    "SELECT * FROM usage_logs WHERE agent_id = ? AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1"
  ).get("test-agent-001") as Record<string, unknown> | undefined;

  assert(logRow !== undefined, "WhatsApp usage_logs row exists");
  if (logRow) {
    assert(logRow.channel === "whatsapp", "channel is whatsapp");
    assert(logRow.target_address === "+972526557547", "target_address is recipient");
  }
  db.close();

  // ------------------------------------------------------------------
  // 4. Send with template params
  // ------------------------------------------------------------------
  console.log("\nTest: send WhatsApp with template params");

  const templateResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Template message body",
      channel: "whatsapp",
      templateId: "HXtest123template",
      templateVars: { "1": "John", "2": "2024-01-15" },
    },
  });

  const templateText = (templateResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const templateParsed = JSON.parse(templateText);

  assert(templateParsed.success === true, "template WhatsApp send returned success");
  assert(templateParsed.channel === "whatsapp", "template response channel is whatsapp");

  // Verify template send logged in usage_logs
  const db3 = new Database(DB_PATH, { readonly: true });
  const templateLog = db3.prepare(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'whatsapp'"
  ).get("test-agent-001") as { cnt: number };
  assert(templateLog.cnt >= 2, "at least 2 WhatsApp usage_logs entries (plain + template)");
  db3.close();

  // ------------------------------------------------------------------
  // 5. Simulate inbound WhatsApp webhook
  // ------------------------------------------------------------------
  console.log("\nTest: inbound WhatsApp webhook");

  const webhookResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MessageSid: "SM_whatsapp_inbound_test_001",
      From: "whatsapp:+972526557547",
      To: "whatsapp:+1234567890",
      Body: "Reply from human via WhatsApp",
      NumMedia: "0",
    }).toString(),
  });

  assert(webhookResp.status === 200, "webhook returns 200");
  const webhookBody = await webhookResp.text();
  assert(webhookBody === "<Response/>", "webhook returns TwiML <Response/>");

  // Inbound webhooks no longer store to messages table (forwarded to agent callback)
  // The 200 response + TwiML above confirms the webhook was processed

  // ------------------------------------------------------------------
  // 7. Error cases
  // ------------------------------------------------------------------
  console.log("\nTest: error cases");

  // Agent without whatsapp_sender_sid
  const tempDb = new Database(DB_PATH);
  tempDb.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, phone_number, status) VALUES (?, ?, ?, ?, 'active')"
  ).run("temp-no-wa-id", "temp-no-whatsapp", "No WhatsApp Agent", "+15550000000");
  tempDb.close();

  const noWaResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "temp-no-whatsapp",
      to: "+972526557547",
      body: "Should fail",
      channel: "whatsapp",
    },
  });
  const noWaParsed = JSON.parse(
    (noWaResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(noWaParsed.error !== undefined, "agent without whatsapp_sender_sid returns error");
  assert(noWaParsed.error.includes("WhatsApp"), "error mentions WhatsApp");

  // Webhook with unknown agent
  const unknownResp = await fetch(`${SERVER_URL}/webhooks/does-not-exist/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MessageSid: "SM_unknown",
      From: "whatsapp:+972526557547",
      To: "whatsapp:+1234567890",
      Body: "Unknown agent",
    }).toString(),
  });
  assert(unknownResp.status === 404, "unknown agent webhook returns 404");

  // Webhook with missing fields
  const missingResp = await fetch(`${SERVER_URL}/webhooks/test-agent-001/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}).toString(),
  });
  assert(missingResp.status === 400, "missing fields webhook returns 400");

  // ------------------------------------------------------------------
  // 8. Regression: SMS still works
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

  // ------------------------------------------------------------------
  // 9. Regression: Email still works
  // ------------------------------------------------------------------
  console.log("\nTest: Email regression");

  const emailResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "human@example.com",
      body: "Regression test — email still works",
      channel: "email",
      subject: "Regression Check",
    },
  });
  const emailParsed = JSON.parse(
    (emailResult.content as Array<{ type: string; text: string }>)[0]?.text
  );
  assert(emailParsed.success === true, "email send still works (regression)");
  assert(emailParsed.channel === "email", "email channel confirmed");

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  await client.close();

  // Remove temp agent
  const cleanDb = new Database(DB_PATH);
  cleanDb.prepare("DELETE FROM agent_channels WHERE agent_id = ?").run("temp-no-whatsapp");
  cleanDb.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
