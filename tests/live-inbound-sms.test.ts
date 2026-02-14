/**
 * Live test for Phase 3 — Inbound SMS via real Twilio webhook.
 *
 * What this does:
 * 1. Starts ngrok tunnel to localhost:3100
 * 2. Configures Twilio phone number's SMS webhook to the ngrok URL
 * 3. Waits for you to text the Twilio number from your personal phone
 * 4. Checks the database for the inbound message
 * 5. Calls comms_get_messages via MCP to verify
 * 6. Restores the original webhook URL (cleanup)
 *
 * Prerequisites:
 *   - Server running (DEMO_MODE=false, real Twilio credentials in .env)
 *   - ngrok installed
 *   - Test agent seeded with the real Twilio phone number
 *
 * Usage: npx tsx tests/live-inbound-sms.test.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = "http://localhost:3100";
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");
const AGENT_ID = "test-agent-001";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMessageCountBefore(): Promise<number> {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM messages WHERE agent_id = ? AND direction = 'inbound'"
  ).get(AGENT_ID) as { cnt: number };
  db.close();
  return row.cnt;
}

async function waitForNewInboundMessage(
  countBefore: number,
  timeoutSec: number
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare(
      "SELECT * FROM messages WHERE agent_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1"
    ).get(AGENT_ID) as Record<string, unknown> | undefined;
    const count = (
      db.prepare(
        "SELECT COUNT(*) as cnt FROM messages WHERE agent_id = ? AND direction = 'inbound'"
      ).get(AGENT_ID) as { cnt: number }
    ).cnt;
    db.close();

    if (count > countBefore && row) {
      return row;
    }

    await sleep(2000);
    process.stdout.write(".");
  }
  return null;
}

async function main() {
  console.log("\n=== Phase 3: Live Inbound SMS Test ===\n");

  // 0. Check server is running
  try {
    const health = await fetch(`${SERVER_URL}/health`);
    const data = (await health.json()) as { demoMode: boolean };
    if (data.demoMode) {
      console.error("ERROR: Server is running in DEMO_MODE. Restart with DEMO_MODE=false for live test.");
      process.exit(1);
    }
    console.log("Server is running (live mode).\n");
  } catch {
    console.error("ERROR: Server not running. Start it first: node dist/index.js");
    process.exit(1);
  }

  // 1. Get agent phone number
  const db = new Database(DB_PATH, { readonly: true });
  const agentRow = db.prepare(
    "SELECT phone_number FROM agent_channels WHERE agent_id = ?"
  ).get(AGENT_ID) as { phone_number: string } | undefined;
  db.close();

  if (!agentRow?.phone_number) {
    console.error("ERROR: Test agent has no phone number. Run: npm run seed");
    process.exit(1);
  }

  const agentPhone = agentRow.phone_number;
  console.log(`Agent phone: ${agentPhone}`);

  // 2. Find ngrok tunnel (must already be running: ngrok http 3100)
  console.log("Looking for ngrok tunnel...");
  let ngrokUrl = "";
  try {
    const resp = await fetch("http://127.0.0.1:4040/api/tunnels");
    const data = (await resp.json()) as {
      tunnels: Array<{ public_url: string; proto: string }>;
    };
    const httpsTunnel = data.tunnels.find((t) => t.proto === "https");
    if (!httpsTunnel) throw new Error("No HTTPS tunnel found");
    ngrokUrl = httpsTunnel.public_url;
  } catch {
    console.error("ERROR: ngrok not running. Start it first: ngrok http 3100");
    process.exit(1);
  }

  const webhookUrl = `${ngrokUrl}/webhooks/${AGENT_ID}/sms`;
  console.log(`ngrok tunnel: ${ngrokUrl}`);
  console.log(`Webhook URL: ${webhookUrl}\n`);

  // 3. Configure Twilio webhook
  console.log("Configuring Twilio webhook...");
  const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN!;
  const twilioAuthHeader =
    "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");

  // Look up phone number SID
  const lookupResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(agentPhone)}`,
    { headers: { Authorization: twilioAuthHeader } }
  );
  const lookupData = (await lookupResp.json()) as {
    incoming_phone_numbers: Array<{ sid: string; sms_url: string }>;
  };

  if (lookupData.incoming_phone_numbers.length === 0) {
    console.error(`ERROR: Phone ${agentPhone} not found in Twilio account`);
    ngrok.kill();
    process.exit(1);
  }

  const phoneSid = lookupData.incoming_phone_numbers[0].sid;
  const originalSmsUrl = lookupData.incoming_phone_numbers[0].sms_url || "";
  console.log(`Phone SID: ${phoneSid}`);
  console.log(`Original SMS URL: ${originalSmsUrl || "(none)"}`);

  // Set the webhook URL
  const updateResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${phoneSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ SmsUrl: webhookUrl }).toString(),
    }
  );

  if (!updateResp.ok) {
    console.error("Failed to configure webhook:", await updateResp.text());
    ngrok.kill();
    process.exit(1);
  }

  console.log("Webhook configured!\n");

  // 4. Wait for user to send a text
  const countBefore = await getMessageCountBefore();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log(`║  Text ${agentPhone} from your personal phone now.  ║`);
  console.log("║  Waiting up to 60 seconds for the message...       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  process.stdout.write("Waiting");
  const newMessage = await waitForNewInboundMessage(countBefore, 60);
  console.log("\n");

  // 5. Verify
  console.log("Test: inbound message received");
  assert(newMessage !== null, "new inbound message appeared in database");

  if (newMessage) {
    assert(newMessage.agent_id === AGENT_ID, `agent_id is ${AGENT_ID}`);
    assert(newMessage.channel === "sms", "channel is sms");
    assert(newMessage.direction === "inbound", "direction is inbound");
    assert(typeof newMessage.from_address === "string" && (newMessage.from_address as string).startsWith("+"), "from_address is E.164 phone");
    assert(newMessage.to_address === agentPhone, "to_address matches agent phone");
    assert(typeof newMessage.body === "string" && (newMessage.body as string).length > 0, "body is non-empty");
    assert(typeof newMessage.external_id === "string" && (newMessage.external_id as string).startsWith("SM"), "external_id is a Twilio MessageSid");
    assert(newMessage.status === "received", "status is received");

    console.log(`\n  From: ${newMessage.from_address}`);
    console.log(`  Body: "${newMessage.body}"`);
    console.log(`  Twilio SID: ${newMessage.external_id}`);
  }

  // 6. Verify via MCP tool
  console.log("\nTest: comms_get_messages shows inbound message");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "comms_get_messages",
    arguments: { agentId: AGENT_ID, limit: 5 },
  });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  const parsed = JSON.parse(text);

  assert(parsed.count > 0, "comms_get_messages returns messages");

  if (newMessage) {
    const found = parsed.messages.find(
      (m: Record<string, unknown>) => m.externalId === newMessage.external_id
    );
    assert(found !== undefined, "inbound message found via comms_get_messages");
  }

  await client.close();

  // 7. Cleanup — restore original webhook URL
  console.log("\nCleaning up — restoring original webhook URL...");
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${phoneSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ SmsUrl: originalSmsUrl }).toString(),
    }
  );
  console.log("Original webhook restored.");

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
