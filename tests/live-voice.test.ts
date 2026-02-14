/**
 * Live test for comms_send_voice_message tool.
 *
 * Uses real Edge TTS + real Twilio call.
 * Prerequisites:
 *   - Server running with DEMO_MODE=false and WEBHOOK_BASE_URL set to ngrok URL
 *   - Twilio credentials configured in .env
 *   - ngrok tunnel active
 *
 * Usage: npx tsx tests/live-voice.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const SERVER_URL = "http://localhost:3100";

async function main() {
  console.log("\n=== comms_send_voice_message LIVE test ===\n");

  // 1. Connect MCP client
  console.log("Connecting to MCP server...");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "live-test-client", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected.\n");

  // 2. Send voice message
  console.log("Calling comms_send_voice_message...");
  console.log("  Agent: test-agent-001");
  console.log("  To: +972526557547");
  console.log("  Text: Hello! This is a test voice message from AgentOS. If you can hear this, Phase 4 is working.\n");

  const result = await client.callTool({
    name: "comms_send_voice_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      text: "Hello! This is a test voice message from AgentOS. If you can hear this, Phase 4 is working.",
    },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  console.log("Response:", text);

  if (result.isError) {
    console.error("\nCall FAILED. Check server logs for details.");
  } else {
    const parsed = JSON.parse(text);
    console.log(`\nCall placed successfully!`);
    console.log(`  Call SID: ${parsed.callSid}`);
    console.log(`  Status: ${parsed.status}`);
    console.log(`  Audio URL: ${parsed.audioUrl}`);
    console.log(`  Duration: ${parsed.durationSeconds}s`);
    console.log(`\nYour phone should ring shortly...`);
  }

  await client.close();
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
