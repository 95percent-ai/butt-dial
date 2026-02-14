/**
 * Dry test for comms_send_message tool.
 *
 * Tests the full flow with mock adapter (no real Twilio calls):
 * 1. Connects to the MCP server via SSE
 * 2. Calls comms_send_message with the seeded test agent
 * 3. Verifies the tool returns success with a mock message ID
 * 4. Verifies the message was logged in the database
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/send-message.test.ts
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
  console.log("\n=== comms_send_message dry test ===\n");

  // 1. Connect MCP client
  console.log("Connecting to MCP server...");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected.\n");

  // 2. Verify tool is listed
  console.log("Test: tool listing");
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);
  assert(toolNames.includes("comms_send_message"), "comms_send_message is registered");
  assert(toolNames.includes("comms_ping"), "comms_ping is still registered");

  // 3. Call comms_send_message with valid args
  console.log("\nTest: send message (valid agent)");
  const result = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Hello from dry test",
    },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  assert(parsed.success === true, "response has success: true");
  assert(typeof parsed.messageId === "string", "response has messageId");
  assert(typeof parsed.externalId === "string", "response has externalId (mock ID)");
  assert(parsed.externalId.startsWith("mock-msg-"), "externalId starts with mock-msg-");
  assert(parsed.status === "sent", "status is 'sent'");
  assert(parsed.cost === 0.0075, "cost is 0.0075 (mock)");
  assert(parsed.from === "+1234567890", "from is test agent's phone number");
  assert(parsed.to === "+972526557547", "to is the recipient number");

  // 4. Verify database record
  console.log("\nTest: database record");
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare(
    "SELECT * FROM messages WHERE id = ?"
  ).get(parsed.messageId) as Record<string, unknown> | undefined;
  db.close();

  assert(row !== undefined, "message row exists in database");
  if (row) {
    assert(row.agent_id === "test-agent-001", "agent_id matches");
    assert(row.channel === "sms", "channel is 'sms'");
    assert(row.direction === "outbound", "direction is 'outbound'");
    assert(row.from_address === "+1234567890", "from_address matches");
    assert(row.to_address === "+972526557547", "to_address matches");
    assert(row.body === "Hello from dry test", "body matches");
    assert(row.external_id === parsed.externalId, "external_id matches mock ID");
    assert(row.status === "sent", "status is 'sent'");
  }

  // 5. Call with non-existent agent (error case)
  console.log("\nTest: send message (unknown agent)");
  const errResult = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "does-not-exist",
      to: "+972526557547",
      body: "Should fail",
    },
  });

  const errText = (errResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const errParsed = JSON.parse(errText);
  assert(errParsed.error !== undefined, "error response has error field");
  assert(errResult.isError === true, "isError flag is true");

  // 6. Disconnect
  await client.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
