/**
 * Dry test for Phase 10 — Rate Limiting & Cost Tracking.
 *
 * Tests:
 * 1.  getAgentLimits returns config defaults when no DB row
 * 2.  getAgentLimits reads from spending_limits table
 * 3.  logUsage inserts into usage_logs
 * 4.  updateUsageCost updates cost by external ID
 * 5.  checkRateLimits passes when under limits
 * 6.  checkRateLimits blocks per-minute
 * 7.  checkRateLimits blocks per-hour
 * 8.  checkRateLimits blocks per-day
 * 9.  checkRateLimits blocks daily spend
 * 10. checkRateLimits blocks monthly spend
 * 11. checkRateLimits blocks contact frequency (voice)
 * 12. checkRateLimits skips in demo mode
 * 13. checkRateLimits skips for admin
 * 14. RateLimitError has correct fields
 * 15. rateLimitErrorResponse formats correctly
 *
 * Integration tests (server with DEMO_MODE=true):
 * 16. Dashboard tool returns data
 * 17. Set limits tool works
 * 18. SMS send still works (regression)
 * 19. Email send still works (regression)
 * 20. WhatsApp send still works (regression)
 * 21. Provisioning creates spending_limits row
 * 22. Deprovision deletes spending_limits row
 * 23. Send SMS logs usage
 * 24. Dashboard shows correct totals after usage
 * 25. Set limits updates are reflected
 *
 * Usage: npx tsx tests/rate-limiting.test.ts
 */

import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "comms.db");
const SERVER_URL = "http://localhost:3100";

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

// =======================================================================
// Phase A — Unit tests (no server needed)
// =======================================================================

async function testGetAgentLimits() {
  console.log("\n--- getAgentLimits ---");

  const { getAgentLimits } = await import("../src/security/rate-limiter.js");

  const db = new Database(DB_PATH);

  // Run schemas
  const projectRoot = path.join(__dirname, "..");
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-security.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-rate-limiting.sql"), "utf-8"));

  const dbProvider = {
    query: <T>(sql: string, params?: unknown[]): T[] => {
      const stmt = db.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },
    run: (sql: string, params?: unknown[]) => {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };

  // Clean up test data
  db.prepare("DELETE FROM spending_limits WHERE agent_id LIKE 'test-rl-%'").run();
  db.prepare("DELETE FROM usage_logs WHERE agent_id LIKE 'test-rl-%'").run();

  // Ensure test agent
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run("rl-test-001", "test-rl-agent", "Rate Limit Test");

  // Test 1: No DB row → config defaults
  const defaults = getAgentLimits(dbProvider, "test-rl-agent");
  assert(defaults.maxActionsPerMinute === 10, "default maxActionsPerMinute = 10");
  assert(defaults.maxActionsPerDay === 500, "default maxActionsPerDay = 500");
  assert(defaults.maxSpendPerDay === 10, "default maxSpendPerDay = 10");

  // Test 2: Insert custom row → reads from DB
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), "test-rl-agent", 5, 50, 200, 5.0, 50.0);

  const custom = getAgentLimits(dbProvider, "test-rl-agent");
  assert(custom.maxActionsPerMinute === 5, "custom maxActionsPerMinute = 5");
  assert(custom.maxActionsPerDay === 200, "custom maxActionsPerDay = 200");
  assert(custom.maxSpendPerDay === 5, "custom maxSpendPerDay = 5");

  db.close();
}

async function testLogUsage() {
  console.log("\n--- logUsage + updateUsageCost ---");

  const { logUsage, updateUsageCost } = await import("../src/security/rate-limiter.js");

  const db = new Database(DB_PATH);
  db.exec(fs.readFileSync(path.join(__dirname, "..", "src/db/schema-rate-limiting.sql"), "utf-8"));

  const dbProvider = {
    query: <T>(sql: string, params?: unknown[]): T[] => {
      return (params ? db.prepare(sql).all(...params) : db.prepare(sql).all()) as T[];
    },
    run: (sql: string, params?: unknown[]) => {
      const result = params ? db.prepare(sql).run(...params) : db.prepare(sql).run();
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };

  // Clean
  db.prepare("DELETE FROM usage_logs WHERE agent_id LIKE 'test-rl-%'").run();

  // Test 3: logUsage inserts a row
  const extId = `test-ext-${randomUUID()}`;
  const logId = logUsage(dbProvider, {
    agentId: "test-rl-agent",
    actionType: "sms",
    channel: "sms",
    targetAddress: "+15551234567",
    cost: 0.0075,
    externalId: extId,
  });

  assert(typeof logId === "string" && logId.length > 0, "logUsage returns an ID");

  const row = db.prepare("SELECT * FROM usage_logs WHERE id = ?").get(logId) as Record<string, unknown>;
  assert(row !== undefined, "usage_logs row exists");
  assert(row.agent_id === "test-rl-agent", "agent_id matches");
  assert(row.action_type === "sms", "action_type matches");
  assert(row.cost === 0.0075, "cost matches");

  // Test 4: updateUsageCost
  updateUsageCost(dbProvider, extId, 0.015);
  const updated = db.prepare("SELECT cost FROM usage_logs WHERE external_id = ?").get(extId) as { cost: number };
  assert(updated.cost === 0.015, "cost updated to 0.015");

  db.close();
}

async function testCheckRateLimits() {
  console.log("\n--- checkRateLimits ---");

  const { checkRateLimits, logUsage, RateLimitError } = await import("../src/security/rate-limiter.js");
  // Override demoMode so rate limits actually fire (server runs in DEMO_MODE=true)
  const { config } = await import("../src/lib/config.js");
  const originalDemoMode = config.demoMode;
  (config as any).demoMode = false;

  const db = new Database(DB_PATH);
  const projectRoot = path.join(__dirname, "..");
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-security.sql"), "utf-8"));
  db.exec(fs.readFileSync(path.join(projectRoot, "src/db/schema-rate-limiting.sql"), "utf-8"));

  const dbProvider = {
    query: <T>(sql: string, params?: unknown[]): T[] => {
      return (params ? db.prepare(sql).all(...params) : db.prepare(sql).all()) as T[];
    },
    run: (sql: string, params?: unknown[]) => {
      const result = params ? db.prepare(sql).run(...params) : db.prepare(sql).run();
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };

  const testAgentId = `test-rl-check-${randomUUID().slice(0, 8)}`;

  // Clean + create agent
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), testAgentId, "Rate Check Test");

  // Set very low limits for this agent
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), testAgentId, 2, 5, 10, 0.05, 0.50);

  // Test 5: Passes when under limits
  let passedCheck = true;
  try {
    checkRateLimits(dbProvider, testAgentId, "sms", "sms", "+15551111111");
  } catch {
    passedCheck = false;
  }
  assert(passedCheck, "checkRateLimits passes when under all limits");

  // Test 6: Blocks per-minute
  logUsage(dbProvider, { agentId: testAgentId, actionType: "sms", channel: "sms", targetAddress: "+15551111111" });
  logUsage(dbProvider, { agentId: testAgentId, actionType: "sms", channel: "sms", targetAddress: "+15551111111" });

  let perMinBlocked = false;
  try {
    checkRateLimits(dbProvider, testAgentId, "sms", "sms", "+15551111111");
  } catch (err) {
    perMinBlocked = err instanceof RateLimitError && err.limitType === "per-minute";
  }
  assert(perMinBlocked, "per-minute limit blocks at 2 actions");

  // Test 7: Blocks per-hour (use a fresh agent)
  const hourAgent = `test-rl-hour-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), hourAgent, "Hour Test");
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), hourAgent, 100, 3, 1000, 100, 1000);

  // Insert 3 actions slightly in the past (within the hour)
  for (let i = 0; i < 3; i++) {
    db.prepare(
      "INSERT INTO usage_logs (id, agent_id, action_type, channel, created_at) VALUES (?, ?, 'sms', 'sms', datetime('now', '-30 seconds'))"
    ).run(randomUUID(), hourAgent);
  }

  let perHourBlocked = false;
  try {
    checkRateLimits(dbProvider, hourAgent, "sms", "sms", "+15552222222");
  } catch (err) {
    perHourBlocked = err instanceof RateLimitError && err.limitType === "per-hour";
  }
  assert(perHourBlocked, "per-hour limit blocks at 3 actions");

  // Test 8: Blocks per-day
  const dayAgent = `test-rl-day-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), dayAgent, "Day Test");
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), dayAgent, 1000, 1000, 2, 100, 1000);

  for (let i = 0; i < 2; i++) {
    db.prepare(
      "INSERT INTO usage_logs (id, agent_id, action_type, channel, created_at) VALUES (?, ?, 'sms', 'sms', datetime('now', '-30 seconds'))"
    ).run(randomUUID(), dayAgent);
  }

  let perDayBlocked = false;
  try {
    checkRateLimits(dbProvider, dayAgent, "sms", "sms", "+15553333333");
  } catch (err) {
    perDayBlocked = err instanceof RateLimitError && err.limitType === "per-day";
  }
  assert(perDayBlocked, "per-day limit blocks at 2 actions");

  // Test 9: Blocks daily spend
  const spendDayAgent = `test-rl-spday-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), spendDayAgent, "SpendDay Test");
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), spendDayAgent, 1000, 1000, 1000, 0.01, 1000);

  db.prepare(
    "INSERT INTO usage_logs (id, agent_id, action_type, channel, cost, created_at) VALUES (?, ?, 'sms', 'sms', 0.02, datetime('now', '-10 seconds'))"
  ).run(randomUUID(), spendDayAgent);

  let dailySpendBlocked = false;
  try {
    checkRateLimits(dbProvider, spendDayAgent, "sms", "sms", "+15554444444");
  } catch (err) {
    dailySpendBlocked = err instanceof RateLimitError && err.limitType === "daily-spend";
  }
  assert(dailySpendBlocked, "daily spend limit blocks");

  // Test 10: Blocks monthly spend
  const spendMonthAgent = `test-rl-spmo-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), spendMonthAgent, "SpendMonth Test");
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), spendMonthAgent, 1000, 1000, 1000, 1000, 0.01);

  db.prepare(
    "INSERT INTO usage_logs (id, agent_id, action_type, channel, cost, created_at) VALUES (?, ?, 'sms', 'sms', 0.02, datetime('now', '-10 seconds'))"
  ).run(randomUUID(), spendMonthAgent);

  let monthlySpendBlocked = false;
  try {
    checkRateLimits(dbProvider, spendMonthAgent, "sms", "sms", "+15555555555");
  } catch (err) {
    monthlySpendBlocked = err instanceof RateLimitError && err.limitType === "monthly-spend";
  }
  assert(monthlySpendBlocked, "monthly spend limit blocks");

  // Test 11: Contact frequency (voice calls to same number)
  const contactAgent = `test-rl-cf-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO agent_channels (id, agent_id, display_name, status) VALUES (?, ?, ?, 'active')"
  ).run(randomUUID(), contactAgent, "Contact Freq Test");
  db.prepare(
    "INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), contactAgent, 1000, 1000, 1000, 1000, 10000);

  // Default contact limit is 2/day — insert 2 calls to same number
  const sameNumber = "+15556666666";
  for (let i = 0; i < 2; i++) {
    db.prepare(
      "INSERT INTO usage_logs (id, agent_id, action_type, channel, target_address, created_at) VALUES (?, ?, 'voice_call', 'voice', ?, datetime('now', '-10 seconds'))"
    ).run(randomUUID(), contactAgent, sameNumber);
  }

  let contactBlocked = false;
  try {
    checkRateLimits(dbProvider, contactAgent, "voice_call", "voice", sameNumber);
  } catch (err) {
    contactBlocked = err instanceof RateLimitError && err.limitType === "contact-frequency";
  }
  assert(contactBlocked, "contact frequency blocks voice calls to same number");

  // Test 12: Admin skips rate limits
  let adminPassed = true;
  try {
    // Reuse the per-minute blocked agent
    checkRateLimits(dbProvider, testAgentId, "sms", "sms", "+15551111111", {
      token: "orchestrator",
      clientId: "admin",
      scopes: ["admin"],
    });
  } catch {
    adminPassed = false;
  }
  assert(adminPassed, "admin (orchestrator token) skips rate limits");

  // Restore demoMode
  (config as any).demoMode = originalDemoMode;
  db.close();
}

async function testRateLimitError() {
  console.log("\n--- RateLimitError + rateLimitErrorResponse ---");

  const { RateLimitError, rateLimitErrorResponse } = await import("../src/security/rate-limiter.js");

  // Test 13: Error has correct fields
  const err = new RateLimitError("per-minute", 10, 10, "in up to 60 seconds");
  assert(err.limitType === "per-minute", "limitType is per-minute");
  assert(err.current === 10, "current is 10");
  assert(err.max === 10, "max is 10");
  assert(err.message.includes("per-minute"), "message includes limit type");

  // Test 14: Response format
  const resp = rateLimitErrorResponse(err);
  assert(resp.isError === true, "response isError is true");
  const body = JSON.parse(resp.content[0].text);
  assert(body.limitType === "per-minute", "response body has limitType");
  assert(body.current === 10, "response body has current");
}

// =======================================================================
// Phase B — Integration tests (server with DEMO_MODE=true)
// =======================================================================

async function mcpCall(tool: string, args: Record<string, unknown>) {
  // Connect to SSE to get session
  const sseRes = await fetch(`${SERVER_URL}/sse`);
  const reader = sseRes.body!.getReader();
  const decoder = new TextDecoder();

  let sessionUrl = "";
  while (true) {
    const { value } = await reader.read();
    const text = decoder.decode(value);
    const match = text.match(/data:\s*(\/messages\?sessionId=[^\n]+)/);
    if (match) {
      sessionUrl = `${SERVER_URL}${match[1]}`;
      break;
    }
  }

  // Initialize
  await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } }),
  });

  // Call tool
  const toolRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }),
  });

  // Read response from SSE
  let resultText = "";
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Look for result with id:2
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.id === 2 && parsed.result) {
              resultText = parsed.result.content?.[0]?.text || "";
              reader.cancel();
              return { text: resultText, parsed: resultText ? JSON.parse(resultText) : null, isError: parsed.result.isError };
            }
          } catch { /* not JSON or not our response */ }
        }
      }
    }
  }

  reader.cancel();
  return { text: resultText, parsed: resultText ? JSON.parse(resultText) : null, isError: false };
}

async function testIntegration() {
  console.log("\n--- Integration Tests (DEMO_MODE=true) ---");

  // Check server is running
  try {
    const health = await fetch(`${SERVER_URL}/health`);
    if (!health.ok) throw new Error("Server not ready");
  } catch {
    console.log("  ⏭ Server not running at " + SERVER_URL + " — skipping integration tests");
    return;
  }

  const testAgentId = `test-rl-integ-${randomUUID().slice(0, 8)}`;

  // Test 15: Provision creates spending_limits row
  const prov = await mcpCall("comms_provision_channels", {
    agentId: testAgentId,
    displayName: "RL Integration Test",
    capabilities: { phone: true, whatsapp: false, email: true, voiceAi: false },
  });
  assert(prov.parsed?.success === true, "provisioning succeeds");

  // Verify spending_limits row exists
  const db = new Database(DB_PATH);
  const limitsRow = db.prepare("SELECT * FROM spending_limits WHERE agent_id = ?").get(testAgentId);
  assert(limitsRow !== undefined, "spending_limits row created on provision");

  // Test 16: SMS send works (regression + usage logging)
  const sms = await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "+15559999999",
    body: "Rate limit test",
    channel: "sms",
  });
  assert(sms.parsed?.success === true, "SMS send succeeds (regression)");

  // Test 17: Email send works (regression)
  const email = await mcpCall("comms_send_message", {
    agentId: testAgentId,
    to: "test@example.com",
    body: "Rate limit test email",
    channel: "email",
    subject: "Test",
  });
  assert(email.parsed?.success === true, "email send succeeds (regression)");

  // Test 18: Usage logged after sends
  const usageLogs = db.prepare(
    "SELECT * FROM usage_logs WHERE agent_id = ? ORDER BY created_at"
  ).all(testAgentId) as Array<Record<string, unknown>>;
  assert(usageLogs.length >= 2, `usage_logs has ${usageLogs.length} entries (expected >= 2)`);

  // Test 19: Dashboard returns data
  const dash = await mcpCall("comms_get_usage_dashboard", {
    agentId: testAgentId,
    period: "today",
  });
  assert(dash.parsed?.agentId === testAgentId, "dashboard returns correct agentId");
  assert(dash.parsed?.totalActions >= 2, "dashboard shows correct total actions");
  assert(dash.parsed?.limits !== undefined, "dashboard includes limits");

  // Test 20: Set limits works
  const setLimits = await mcpCall("comms_set_agent_limits", {
    agentId: testAgentId,
    limits: { maxActionsPerMinute: 99, maxSpendPerDay: 50 },
  });
  assert(setLimits.parsed?.success === true, "set limits succeeds");
  assert(setLimits.parsed?.currentLimits?.maxActionsPerMinute === 99, "limits updated to 99/min");
  assert(setLimits.parsed?.currentLimits?.maxSpendPerDay === 50, "daily spend updated to $50");

  // Test 21: Dashboard reflects new limits
  const dash2 = await mcpCall("comms_get_usage_dashboard", {
    agentId: testAgentId,
    period: "today",
  });
  assert(dash2.parsed?.limits?.maxActionsPerMinute === 99, "dashboard reflects updated limits");

  // Test 22: Deprovision deletes spending_limits row
  const deprov = await mcpCall("comms_deprovision_channels", {
    agentId: testAgentId,
  });
  assert(deprov.parsed?.success === true, "deprovision succeeds");

  const afterDeprov = db.prepare("SELECT * FROM spending_limits WHERE agent_id = ?").get(testAgentId);
  assert(afterDeprov === undefined, "spending_limits row deleted on deprovision");

  db.close();
}

// =======================================================================
// Main
// =======================================================================

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Phase 10 — Rate Limiting & Cost Track   ║");
  console.log("╚══════════════════════════════════════════╝");

  // Phase A: Unit tests
  await testGetAgentLimits();
  await testLogUsage();
  await testCheckRateLimits();
  await testRateLimitError();

  // Phase B: Integration
  await testIntegration();

  console.log(`\n════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`════════════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
