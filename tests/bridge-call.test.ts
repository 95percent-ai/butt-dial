/**
 * Dry test for Call Bridging feature.
 *
 * Tests:
 * 1. comms_bridge_call tool is registered
 * 2. Setup bridge route
 * 3. Setup duplicate route → error
 * 4. List bridge routes + recent calls
 * 5. Call action (programmatic bridge call)
 * 6. Remove bridge route
 * 7. Remove non-existent route → error
 * 8. Bridge tables exist in DB
 * 9. Inbound voice webhook matches bridge route → returns Dial TwiML
 * 10. Inbound voice webhook no bridge match → returns ConversationRelay TwiML
 * 11. Bridge status webhook updates call record
 * 12. Setup missing params → error
 * 13. Call missing params → error
 * 14. Regression: existing voice tools still work
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/bridge-call.test.ts
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
  console.log("\n=== Call Bridging dry test ===\n");

  // Setup: ensure test agent exists, clean up leftover bridge data
  const setupDb = new Database(DB_PATH);
  setupDb.prepare("DELETE FROM bridge_registry WHERE org_id = 'default' AND label LIKE 'test-%'").run();
  setupDb.prepare("DELETE FROM bridge_calls WHERE org_id = 'default' AND caller LIKE '+1555test%'").run();

  // Ensure test agent exists
  setupDb.prepare(
    `INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, phone_number, status)
     VALUES (?, ?, ?, ?, 'active')`
  ).run("test-bridge-agent-id", "test-bridge-agent", "Bridge Test Agent", "+15551234567");

  setupDb.close();
  console.log("Setup: test agent ready\n");

  // ------------------------------------------------------------------
  // 1. Connect MCP + verify tool registered
  // ------------------------------------------------------------------
  console.log("Test: MCP connection + tool discovery");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "bridge-call-test", version: "1.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t: { name: string }) => t.name);

  assert(toolNames.includes("comms_bridge_call"), "comms_bridge_call tool registered");

  // ------------------------------------------------------------------
  // 2. Setup a bridge route
  // ------------------------------------------------------------------
  console.log("\nTest: setup bridge route");
  const setupResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "setup",
      fromNumber: "+972502629999",
      localNumber: "+15551234567",
      destinationNumber: "+85291511443",
      label: "test-bridge-IL-to-HK",
    },
  }));

  assert(setupResult.success === true, "Bridge route created");
  assert(typeof setupResult.bridgeId === "string", "Bridge ID returned");
  assert(setupResult.localNumber === "+15551234567", "Local number correct");
  assert(setupResult.callerPattern === "+972502629999", "Caller pattern correct");
  assert(setupResult.destinationNumber === "+85291511443", "Destination correct");

  const bridgeId = setupResult.bridgeId as string;

  // ------------------------------------------------------------------
  // 3. Setup duplicate route → error
  // ------------------------------------------------------------------
  console.log("\nTest: duplicate bridge route");
  const dupResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "setup",
      fromNumber: "+972502629999",
      localNumber: "+15551234567",
      destinationNumber: "+85291511443",
      label: "test-bridge-duplicate",
    },
  }));

  assert(typeof dupResult.error === "string", "Duplicate route rejected");
  assert(dupResult.existingId === bridgeId, "Existing ID returned");

  // ------------------------------------------------------------------
  // 4. List bridge routes
  // ------------------------------------------------------------------
  console.log("\nTest: list bridge routes");
  const listResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: { action: "list" },
  }));

  const routes = listResult.routes as Array<Record<string, unknown>>;
  assert(Array.isArray(routes), "Routes is an array");
  assert(routes.length >= 1, "At least one route exists");

  const ourRoute = routes.find(r => r.id === bridgeId);
  assert(ourRoute != null, "Our test route found in list");
  assert(ourRoute?.active === true, "Route is active");

  assert(Array.isArray(listResult.recentCalls), "Recent calls is an array");

  // ------------------------------------------------------------------
  // 5. Call action (programmatic bridge call)
  // ------------------------------------------------------------------
  console.log("\nTest: programmatic bridge call");
  const callResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "call",
      callerNumber: "+1555test001",
      destinationNumber: "+85291511443",
      bridgeId: bridgeId,
    },
  }));

  assert(callResult.success === true, "Bridge call initiated");
  assert(typeof callResult.bridgeCallId === "string", "Bridge call ID returned");
  assert(typeof callResult.callSid === "string", "Call SID returned");
  assert(callResult.caller === "+1555test001", "Caller matches");
  assert(callResult.destination === "+85291511443", "Destination matches");

  const bridgeCallId = callResult.bridgeCallId as string;

  // ------------------------------------------------------------------
  // 6. Bridge tables exist + data inserted
  // ------------------------------------------------------------------
  console.log("\nTest: bridge tables in DB");
  const verifyDb = new Database(DB_PATH);

  const routeRows = verifyDb.prepare(
    "SELECT * FROM bridge_registry WHERE id = ?"
  ).all(bridgeId) as Array<Record<string, unknown>>;
  assert(routeRows.length === 1, "Bridge route exists in DB");

  const callRows = verifyDb.prepare(
    "SELECT * FROM bridge_calls WHERE id = ?"
  ).all(bridgeCallId) as Array<Record<string, unknown>>;
  assert(callRows.length === 1, "Bridge call log exists in DB");
  assert(callRows[0]?.bridge_id === bridgeId, "Bridge call linked to route");

  // ------------------------------------------------------------------
  // 7. Bridge status webhook
  // ------------------------------------------------------------------
  console.log("\nTest: bridge status webhook");
  const statusRes = await fetch(`${SERVER_URL}/webhooks/bridge-status?bridgeCallId=${bridgeCallId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      CallSid: "CA_mock_bridge_001",
      CallStatus: "completed",
      CallDuration: "120",
      DialCallSid: "CA_mock_bridge_outbound_001",
    }).toString(),
  });

  assert(statusRes.status === 200, "Bridge status callback returns 200");

  // Verify DB was updated
  const updatedCall = verifyDb.prepare(
    "SELECT * FROM bridge_calls WHERE id = ?"
  ).get(bridgeCallId) as Record<string, unknown>;

  assert(updatedCall?.status === "completed", "Bridge call status updated");
  assert(updatedCall?.duration === 120, "Bridge call duration recorded");
  assert(updatedCall?.outbound_sid === "CA_mock_bridge_outbound_001", "Outbound SID recorded");
  assert(updatedCall?.ended_at != null, "Ended_at timestamp set");

  // ------------------------------------------------------------------
  // 8. Inbound voice webhook — bridge match
  // ------------------------------------------------------------------
  console.log("\nTest: inbound voice bridge detection");
  const bridgeVoiceRes = await fetch(`${SERVER_URL}/webhooks/test-bridge-agent/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      CallSid: "CA_inbound_bridge_test_001",
      From: "+972502629999",
      To: "+15551234567",
      Direction: "inbound",
      CallStatus: "ringing",
    }).toString(),
  });

  assert(bridgeVoiceRes.status === 200, "Inbound bridge voice returns 200");
  const bridgeTwiml = await bridgeVoiceRes.text();
  assert(bridgeTwiml.includes("<Dial"), "Bridge returns <Dial> TwiML");
  assert(bridgeTwiml.includes("+85291511443"), "Dial targets destination number");
  assert(!bridgeTwiml.includes("ConversationRelay"), "No ConversationRelay for bridge calls");

  // ------------------------------------------------------------------
  // 9. Inbound voice webhook — no bridge match (normal AI flow)
  // ------------------------------------------------------------------
  console.log("\nTest: inbound voice — no bridge match");
  const normalVoiceRes = await fetch(`${SERVER_URL}/webhooks/test-bridge-agent/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      CallSid: "CA_inbound_normal_test_001",
      From: "+14155551234",
      To: "+15551234567",
      Direction: "inbound",
      CallStatus: "ringing",
    }).toString(),
  });

  assert(normalVoiceRes.status === 200, "Normal inbound voice returns 200");
  const normalTwiml = await normalVoiceRes.text();
  // In demo mode, mock orchestrator returns <Say> TwiML instead of <ConversationRelay>
  assert(normalTwiml.includes("<Say") || normalTwiml.includes("ConversationRelay") || normalTwiml.includes("Connect"), "Normal flow returns voice TwiML (Say/ConversationRelay)");
  assert(!normalTwiml.includes("+85291511443"), "Normal flow does NOT dial bridge destination");

  // ------------------------------------------------------------------
  // 10. Setup missing params → error
  // ------------------------------------------------------------------
  console.log("\nTest: setup with missing params");
  const missingResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "setup",
      fromNumber: "+972502629999",
      // missing localNumber and destinationNumber
    },
  }));

  assert(typeof missingResult.error === "string", "Missing params returns error");

  // ------------------------------------------------------------------
  // 11. Call with missing params → error
  // ------------------------------------------------------------------
  console.log("\nTest: call with missing params");
  const callMissing = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "call",
      callerNumber: "+1555test002",
      // missing destinationNumber
    },
  }));

  assert(typeof callMissing.error === "string", "Call missing params returns error");

  // ------------------------------------------------------------------
  // 12. Setup wildcard route
  // ------------------------------------------------------------------
  console.log("\nTest: wildcard bridge route");
  const wildcardResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "setup",
      fromNumber: "*",
      localNumber: "+15551234567",
      destinationNumber: "+442071234567",
      label: "test-bridge-wildcard",
    },
  }));

  assert(wildcardResult.success === true, "Wildcard route created");
  const wildcardId = wildcardResult.bridgeId as string;

  // ------------------------------------------------------------------
  // 13. Remove bridge route
  // ------------------------------------------------------------------
  console.log("\nTest: remove bridge route");
  const removeResult = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "remove",
      bridgeId: bridgeId,
    },
  }));

  assert(removeResult.success === true, "Bridge route removed");
  assert(removeResult.removed === bridgeId, "Correct route removed");

  // Also remove the wildcard
  await client.callTool({
    name: "comms_bridge_call",
    arguments: { action: "remove", bridgeId: wildcardId },
  });

  // ------------------------------------------------------------------
  // 14. Remove non-existent route → error
  // ------------------------------------------------------------------
  console.log("\nTest: remove non-existent route");
  const badRemove = callToolParsed(await client.callTool({
    name: "comms_bridge_call",
    arguments: {
      action: "remove",
      bridgeId: "non-existent-id",
    },
  }));

  assert(typeof badRemove.error === "string", "Non-existent route returns error");

  // ------------------------------------------------------------------
  // 15. Regression: make_call still works
  // ------------------------------------------------------------------
  console.log("\nTest: regression — comms_make_call still works");
  const makeCallResult = callToolParsed(await client.callTool({
    name: "comms_make_call",
    arguments: {
      agentId: "test-bridge-agent",
      to: "+15559990001",
    },
  }));

  assert(makeCallResult.success === true, "comms_make_call still works (regression)");

  // ------------------------------------------------------------------
  // Cleanup (delete dependent rows first to avoid FK errors)
  // ------------------------------------------------------------------
  try { verifyDb.prepare("DELETE FROM bridge_calls WHERE org_id = 'default'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM bridge_registry WHERE label LIKE 'test-%'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM dead_letters WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM call_logs WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM usage_logs WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM usage_logs WHERE agent_id = 'bridge'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM spending_limits WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM agent_tokens WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  try { verifyDb.prepare("DELETE FROM agent_channels WHERE agent_id = 'test-bridge-agent'").run(); } catch {}
  verifyDb.close();

  // Disconnect MCP
  await client.close();

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed}/${passed + failed} passed ===`);
  if (failed > 0) {
    console.error(`\n${failed} test(s) FAILED`);
    process.exit(1);
  } else {
    console.log("\nAll tests passed!");
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
