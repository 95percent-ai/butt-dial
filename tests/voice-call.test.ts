/**
 * Dry test for Voice AI Conversation (refactored).
 *
 * Tests with DEMO_MODE=true (no real APIs, no agent connected):
 * 1. comms_make_call tool — initiates outbound AI voice call
 * 2. Message stored in DB (channel: voice, direction: outbound)
 * 3. WebSocket endpoint accessible and responds to messages
 * 4. No agent connected → hard-coded fallback (Path C)
 * 5. Answering machine mode activates when no agent session
 * 6. Voicemail stored in DB after answering-machine call ends
 * 7. Error cases: unknown agent, missing params
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/voice-call.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import WebSocket from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const WS_URL = "ws://localhost:3100";
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

/** Helper: open a WebSocket and collect messages until timeout or close */
function openWs(path: string, timeoutMs = 3000): Promise<{ messages: unknown[]; connected: boolean }> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let connected = false;

    const ws = new WebSocket(`${WS_URL}${path}`);

    const timer = setTimeout(() => {
      ws.close();
      resolve({ messages, connected });
    }, timeoutMs);

    ws.on("open", () => {
      connected = true;
    });

    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        messages.push(data.toString());
      }
    });

    ws.on("close", () => {
      clearTimeout(timer);
      resolve({ messages, connected });
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve({ messages, connected });
    });
  });
}

async function main() {
  console.log("\n=== Voice Call + Answering Machine dry test ===\n");

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
  assert(toolNames.includes("comms_make_call"), "comms_make_call is registered");

  // 3. Make call (valid agent)
  console.log("\nTest: make call (valid agent)");
  const result = await client.callTool({
    name: "comms_make_call",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      systemPrompt: "You are a test AI assistant for dry testing.",
      greeting: "Hello, this is a test call.",
    },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  assert(parsed.success === true, "response has success: true");
  assert(typeof parsed.callSid === "string", "response has callSid");
  assert(typeof parsed.sessionId === "string", "response has sessionId");
  assert(parsed.status === "queued", "status is 'queued'");
  assert(typeof parsed.from === "string" && parsed.from.startsWith("+"), "from is a valid phone number");
  assert(parsed.to === "+972526557547", "to is the recipient number");

  // 4. Verify usage_logs record (messages no longer stored on success)
  console.log("\nTest: usage_logs record");
  const db = new Database(DB_PATH, { readonly: true });
  const logRow = db.prepare(
    "SELECT * FROM usage_logs WHERE agent_id = ? AND channel = 'voice' ORDER BY created_at DESC LIMIT 1"
  ).get("test-agent-001") as Record<string, unknown> | undefined;

  assert(logRow !== undefined, "voice usage_logs row exists");
  if (logRow) {
    assert(logRow.agent_id === "test-agent-001", "agent_id matches");
    assert(logRow.channel === "voice", "channel is 'voice'");
    assert(logRow.target_address === "+972526557547", "target_address matches");
  }

  // 5. WebSocket connectivity
  console.log("\nTest: WebSocket endpoint");
  const wsResult = await openWs("/webhooks/test-agent-001/voice-ws", 2000);
  assert(wsResult.connected, "WebSocket connects to /webhooks/:agentId/voice-ws");

  // 6. WebSocket setup + prompt — no agent connected → hard-coded fallback (Path C)
  console.log("\nTest: WebSocket prompt → no agent → hard-coded fallback");
  const wsConv = await new Promise<{ messages: unknown[]; connected: boolean }>((resolve) => {
    const messages: unknown[] = [];
    let connected = false;

    const ws = new WebSocket(`${WS_URL}/webhooks/test-agent-001/voice-ws`);

    ws.on("open", () => {
      connected = true;

      // Send setup message
      ws.send(JSON.stringify({
        type: "setup",
        callSid: "test-call-dry-001",
        from: "+972526557547",
        to: "+15551234567",
      }));

      // Send prompt message (small delay to let setup process)
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: "prompt",
          voicePrompt: "Hello, can you hear me?",
        }));
      }, 200);

      // Wait for response then close (8s for Anthropic API call)
      setTimeout(() => {
        ws.close();
        resolve({ messages, connected });
      }, 8000);
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        messages.push(parsed);
        // Close early when we get a complete response
        if (parsed.last === true) {
          ws.close();
          resolve({ messages, connected });
        }
      } catch {
        messages.push(data.toString());
      }
    });

    ws.on("error", () => {
      resolve({ messages, connected });
    });
  });

  assert(wsConv.connected, "WebSocket conversation connects");
  assert(wsConv.messages.length > 0, "received response messages from WebSocket");

  if (wsConv.messages.length > 0) {
    const firstMsg = wsConv.messages[0] as Record<string, unknown>;
    assert(firstMsg.type === "text", "response type is 'text'");
    assert(typeof firstMsg.token === "string", "response has token string");
    assert(firstMsg.last === true, "response has last: true (complete message, not streamed)");

    // No agent connected → answering machine (Anthropic) or hard-coded fallback
    const token = (firstMsg.token as string).toLowerCase();
    assert(
      token.includes("no one is available") || token.includes("unavailable") || token.includes("try again") ||
      token.includes("not available") || token.includes("isn't available") || token.includes("leave a message"),
      "fallback message indicates unavailability"
    );
  }

  // 7. Answering machine mode — voicemail stored in DB
  console.log("\nTest: answering machine → voicemail stored in DB");
  const testCallSid = "test-voicemail-" + Date.now();
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`${WS_URL}/webhooks/test-agent-001/voice-ws`);

    ws.on("open", () => {
      // Setup
      ws.send(JSON.stringify({
        type: "setup",
        callSid: testCallSid,
        from: "+15559876543",
        to: "+15551234567",
      }));

      // Simulate caller leaving a message
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: "prompt",
          voicePrompt: "Hi, this is John. Please call me back about the project.",
        }));
      }, 200);

      // Close after response (triggers voicemail storage)
      setTimeout(() => {
        ws.close();
      }, 2000);
    });

    ws.on("close", () => {
      // Small delay for DB write
      setTimeout(() => resolve(), 300);
    });

    ws.on("error", () => resolve());
  });

  // Check dead letter was stored (replaces voicemail_messages)
  const deadLetterRow = db.prepare(
    "SELECT * FROM dead_letters WHERE external_id = ? AND channel = 'voice'"
  ).get(testCallSid) as Record<string, unknown> | undefined;

  assert(deadLetterRow !== undefined, "dead letter row exists in database");
  if (deadLetterRow) {
    assert(deadLetterRow.agent_id === "test-agent-001", "dead letter agent_id matches");
    assert(deadLetterRow.from_address === "+15559876543", "dead letter from_address matches");
    assert(deadLetterRow.status === "pending", "dead letter status is 'pending'");
    assert(
      typeof deadLetterRow.body === "string" &&
      (deadLetterRow.body as string).includes("call me back"),
      "dead letter body contains caller message"
    );
    assert(deadLetterRow.reason === "agent_offline", "dead letter reason is agent_offline");
  }

  db.close();

  // 8. Error case: unknown agent
  console.log("\nTest: make call (unknown agent)");
  const errResult = await client.callTool({
    name: "comms_make_call",
    arguments: {
      agentId: "does-not-exist",
      to: "+972526557547",
    },
  });

  const errText = (errResult.content as Array<{ type: string; text: string }>)[0]?.text;
  const errParsed = JSON.parse(errText);
  assert(errParsed.error !== undefined, "error response has error field");
  assert(errResult.isError === true, "isError flag is true");

  // 9. WebSocket rejects non-voice paths
  console.log("\nTest: WebSocket rejects non-voice paths");
  const badWs = await openWs("/some/random/path", 1000);
  assert(!badWs.connected, "non-voice WebSocket path is rejected");

  // 10. Disconnect
  await client.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
