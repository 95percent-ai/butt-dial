/**
 * Tests for Number Pool + Smart Routing.
 *
 * Tests:
 * 1. detectCountryFromPhone — Israeli number → IL
 * 2. detectCountryFromPhone — US number → US
 * 3. detectCountryFromPhone — UK number → GB
 * 4. detectCountryFromPhone — unknown prefix → US default
 * 5. selectBestNumber — same-country match (IL→IL number)
 * 6. selectBestNumber — same-country match (US→US number)
 * 7. selectBestNumber — no same-country, falls back to default
 * 8. selectBestNumber — no capable numbers → null
 * 9. selectBestNumber — channel filtering (voice-only number skipped for sms)
 * 10. resolveFromNumber — pool hit takes priority over agent phone
 * 11. resolveFromNumber — empty pool falls back to agent phone
 * 12. resolveFromNumber — no pool, no agent phone → null
 * 13. number_pool table exists in DB after migration
 * 14. Seed data: US + IL numbers present
 * 15. Integration: send-message tool uses pool routing (via MCP)
 * 16. Integration: make-call tool uses pool routing (via MCP)
 * 17. Regression: email channel still works (no pool interference)
 * 18. Regression: WhatsApp channel still works (no pool interference)
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *   - Test agent seeded (npm run seed)
 *
 * Usage: npx tsx tests/number-pool.test.ts
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
  const r = result as { content?: { text?: string }[] };
  if (!r?.content?.[0]?.text) return {};
  try { return JSON.parse(r.content[0].text); }
  catch { return {}; }
}

// ---------- Unit tests (direct import) ----------

async function runUnitTests() {
  console.log("\n=== Unit Tests: number-pool.ts ===\n");

  // Dynamic import so it works without full server context
  const { detectCountryFromPhone, selectBestNumber, resolveFromNumber } = await import("../src/lib/number-pool.js");

  // 1. Israeli number
  assert(detectCountryFromPhone("+972502629999") === "IL", "1. +972 → IL");

  // 2. US number
  assert(detectCountryFromPhone("+18452514056") === "US", "2. +1 → US");

  // 3. UK number
  assert(detectCountryFromPhone("+447911123456") === "GB", "3. +44 → GB");

  // 4. Unknown prefix → US default
  assert(detectCountryFromPhone("+999123456") === "US", "4. Unknown prefix → US");

  // ---- selectBestNumber with mock DB ----

  const mockRows = [
    { id: "1", phone_number: "+18452514056", country_code: "US", capabilities: '["sms","voice"]', is_default: 1 },
    { id: "2", phone_number: "+97243760273", country_code: "IL", capabilities: '["sms","voice"]', is_default: 0 },
  ];

  const mockDb = {
    query<T>(_sql: string, _params?: unknown[]): T[] {
      return mockRows as unknown as T[];
    },
  };

  // 5. IL destination → IL number
  assert(
    selectBestNumber(mockDb, "+972502629999", "sms") === "+97243760273",
    "5. Same-country match: IL dest → IL number",
  );

  // 6. US destination → US number
  assert(
    selectBestNumber(mockDb, "+18001234567", "voice") === "+18452514056",
    "6. Same-country match: US dest → US number",
  );

  // 7. UK destination → falls back to default (US)
  assert(
    selectBestNumber(mockDb, "+447911123456", "sms") === "+18452514056",
    "7. No same-country → default US number",
  );

  // 8. Empty DB → null
  const emptyDb = { query: () => [] };
  assert(
    selectBestNumber(emptyDb, "+972502629999", "sms") === null,
    "8. Empty pool → null",
  );

  // 9. Channel filtering — voice-only number not returned for sms
  const voiceOnlyRows = [
    { id: "3", phone_number: "+18452514056", country_code: "US", capabilities: '["voice"]', is_default: 1 },
  ];
  const voiceOnlyDb = { query: () => voiceOnlyRows };
  assert(
    selectBestNumber(voiceOnlyDb, "+18001234567", "sms") === null,
    "9. Voice-only number skipped for sms channel → null",
  );

  // 10. resolveFromNumber — pool hit wins over agent phone
  assert(
    resolveFromNumber(mockDb, "+1111111111", "+972502629999", "sms") === "+97243760273",
    "10. Pool match takes priority over agent phone",
  );

  // 11. resolveFromNumber — empty pool falls back to agent phone
  assert(
    resolveFromNumber(emptyDb, "+1111111111", "+972502629999", "sms") === "+1111111111",
    "11. Empty pool → fallback to agent phone",
  );

  // 12. resolveFromNumber — no pool, no agent phone → null
  assert(
    resolveFromNumber(emptyDb, null, "+972502629999", "sms") === null,
    "12. No pool + no agent phone → null",
  );
}

// ---------- Database tests ----------

function runDbTests() {
  console.log("\n=== Database Tests ===\n");

  const db = new Database(DB_PATH, { readonly: true });

  // 13. Table exists
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='number_pool'"
  ).all();
  assert(tables.length === 1, "13. number_pool table exists");

  // 14. Seed data present
  const rows = db.prepare("SELECT phone_number, country_code, is_default FROM number_pool ORDER BY country_code").all() as {
    phone_number: string;
    country_code: string;
    is_default: number;
  }[];

  const ilRow = rows.find((r) => r.country_code === "IL");
  const usRow = rows.find((r) => r.country_code === "US");

  assert(!!ilRow && ilRow.phone_number === "+97243760273", "14a. IL seed number present");
  assert(!!usRow && usRow.phone_number === "+18452514056" && usRow.is_default === 1, "14b. US seed number present (default)");

  db.close();
}

// ---------- Integration tests (MCP) ----------

async function runIntegrationTests() {
  console.log("\n=== Integration Tests (MCP) ===\n");

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse?agentId=test-agent-001`));
  const client = new Client({ name: "number-pool-test", version: "1.0.0" });
  await client.connect(transport);

  // 15. Send SMS to IL number — should route via pool IL number
  const smsResult = callToolParsed(
    await client.callTool({
      name: "comms_send_message",
      arguments: {
        agentId: "test-agent-001",
        to: "+972502629999",
        body: "Number pool test — IL routing",
        channel: "sms",
      },
    }),
  );
  assert(smsResult.success === true, "15a. SMS to IL succeeded");
  assert(smsResult.from === "+97243760273", "15b. SMS routed via IL pool number");

  // 16. Make call to IL number — should route via pool IL number
  const callResult = callToolParsed(
    await client.callTool({
      name: "comms_make_call",
      arguments: {
        agentId: "test-agent-001",
        to: "+972502629999",
      },
    }),
  );
  assert(callResult.success === true, "16a. Call to IL succeeded");
  assert(callResult.from === "+97243760273", "16b. Call routed via IL pool number");

  // 17. Email still works (no pool interference)
  const emailResult = callToolParsed(
    await client.callTool({
      name: "comms_send_message",
      arguments: {
        agentId: "test-agent-001",
        to: "test@example.com",
        body: "Pool regression test",
        channel: "email",
        subject: "Test",
      },
    }),
  );
  assert(emailResult.success === true, "17. Email channel unaffected by pool");

  // 18. WhatsApp still works (no pool interference)
  const waResult = callToolParsed(
    await client.callTool({
      name: "comms_send_message",
      arguments: {
        agentId: "test-agent-001",
        to: "+972502629999",
        body: "Pool regression test",
        channel: "whatsapp",
      },
    }),
  );
  assert(waResult.success === true, "18. WhatsApp channel unaffected by pool");

  await client.close();
}

// ---------- Main ----------

async function main() {
  console.log("Number Pool + Smart Routing — Test Suite");
  console.log("=========================================");

  await runUnitTests();
  runDbTests();
  await runIntegrationTests();

  console.log(`\n=========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log(`=========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
