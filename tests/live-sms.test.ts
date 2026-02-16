/**
 * Live SMS test — sends a real SMS via Twilio.
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=false and valid Twilio creds
 *   - Test agent seeded with a real Twilio phone number
 *
 * Usage: npx tsx tests/live-sms.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  console.log("\n=== Live SMS Test ===\n");

  console.log("Connecting to MCP server...");
  const transport = new SSEClientTransport(new URL("http://localhost:3100/sse"));
  const client = new Client({ name: "live-test", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected.\n");

  console.log("Sending SMS via comms_send_message...");
  const result = await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      to: "+972526557547",
      body: "Hello from Butt-Dial MCP — live SMS test!",
    },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  if (result.isError) {
    console.error("FAILED:", parsed);
  } else {
    console.log("SUCCESS:");
    console.log(JSON.stringify(parsed, null, 2));
    console.log("\nCheck your phone for the SMS!");
  }

  await client.close();
  console.log("\n=== Done ===\n");
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
