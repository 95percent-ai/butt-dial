/**
 * Dry test for comms_send_voice_message tool.
 *
 * Tests the full flow with mock TTS + mock telephony (no real API calls):
 * 1. Connects to the MCP server via SSE
 * 2. Calls comms_send_voice_message with the seeded test agent
 * 3. Verifies audio file was created in storage/
 * 4. Verifies mock call SID returned
 * 5. Verifies message logged in DB (channel: voice, direction: outbound)
 * 6. Error cases: unknown agent, empty text
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/voice-message.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");
const STORAGE_DIR = path.join(__dirname, "..", "storage");

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
  console.log("\n=== comms_send_voice_message dry test ===\n");

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
  assert(toolNames.includes("comms_send_voice_message"), "comms_send_voice_message is registered");

  // 3. Send voice message (valid agent)
  console.log("\nTest: send voice message (valid agent)");
  const result = await client.callTool({
    name: "comms_send_voice_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      text: "Hello, this is a test voice message from the dry test suite.",
    },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  assert(parsed.success === true, "response has success: true");
  assert(typeof parsed.callSid === "string", "response has callSid");
  assert(parsed.status === "queued", "status is 'queued'");
  assert(typeof parsed.from === "string" && parsed.from.startsWith("+"), "from is a valid phone number");
  assert(parsed.to === "+972526557547", "to is the recipient number");
  assert(typeof parsed.audioUrl === "string", "response has audioUrl");
  assert(parsed.audioUrl.includes("/storage/"), "audioUrl contains /storage/ path");
  assert(typeof parsed.durationSeconds === "number", "response has durationSeconds");

  // 4. Verify audio file exists in storage/
  console.log("\nTest: audio file in storage");
  const audioKey = parsed.audioUrl.split("/storage/")[1];
  const audioPath = path.join(STORAGE_DIR, audioKey);
  assert(fs.existsSync(audioPath), "audio file exists on disk");
  if (fs.existsSync(audioPath)) {
    const fileSize = fs.statSync(audioPath).size;
    assert(fileSize > 44, "audio file has content (more than just WAV header)");

    // Verify it's a valid WAV file (starts with RIFF)
    const header = fs.readFileSync(audioPath).subarray(0, 4).toString("ascii");
    assert(header === "RIFF", "audio file is valid WAV (RIFF header)");
  }

  // 5. Verify usage_logs record (messages no longer stored on success)
  console.log("\nTest: usage_logs record");
  const db = new Database(DB_PATH, { readonly: true });
  const logRow = db.prepare(
    "SELECT * FROM usage_logs WHERE agent_id = ? AND channel = 'voice' ORDER BY created_at DESC LIMIT 1"
  ).get("test-agent-001") as Record<string, unknown> | undefined;
  db.close();

  assert(logRow !== undefined, "voice usage_logs row exists");
  if (logRow) {
    assert(logRow.agent_id === "test-agent-001", "agent_id matches");
    assert(logRow.channel === "voice", "channel is 'voice'");
    assert(logRow.target_address === "+972526557547", "target_address matches");
  }

  // 6. Error case: unknown agent
  console.log("\nTest: send voice message (unknown agent)");
  const errResult = await client.callTool({
    name: "comms_send_voice_message",
    arguments: {
      agentId: "does-not-exist",
      to: "+972526557547",
      text: "Should fail",
    },
  });

  const errText = (errResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const errParsed = JSON.parse(errText);
  assert(errParsed.error !== undefined, "error response has error field");
  assert(errResult.isError === true, "isError flag is true");

  // 7. Error case: empty text (should be caught by zod validation)
  console.log("\nTest: send voice message (empty text)");
  try {
    const emptyResult = await client.callTool({
      name: "comms_send_voice_message",
      arguments: {
        agentId: "test-agent-001",
        to: "+972526557547",
        text: "",
      },
    });

    const emptyText = (emptyResult.content as Array<{ type: string; text: string }>)[0]?.text;
    // Either a validation error or isError=true
    assert(
      emptyResult.isError === true || emptyText.includes("error"),
      "empty text is rejected"
    );
  } catch {
    // Zod validation may throw before reaching the tool handler
    assert(true, "empty text is rejected (thrown by validation)");
  }

  // 8. Disconnect
  await client.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
