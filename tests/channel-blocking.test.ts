/**
 * Channel Blocking — unit + API tests.
 *
 * Tests:
 * 1. Unit: parseBlockedChannels handles null, malformed, valid JSON
 * 2. Unit: isChannelBlocked checks individual channels and wildcard
 * 3. Unit: buildBlockedChannels validates, deduplicates, serializes
 * 4. API: POST blocked-channels endpoint
 * 5. API: GET agents includes blocked_channels field
 * 6. UI: dashboard shows "Provisioned Agents" label
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/channel-blocking.test.ts
 */

import { parseBlockedChannels, isChannelBlocked, buildBlockedChannels } from "../src/lib/channel-blocker.js";

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

async function main() {
  console.log("\n=== Channel Blocking tests ===\n");

  // ------------------------------------------------------------------
  // 1. Unit: parseBlockedChannels
  // ------------------------------------------------------------------
  console.log("Test: parseBlockedChannels");
  assert(JSON.stringify(parseBlockedChannels(null)) === "[]", "null → []");
  assert(JSON.stringify(parseBlockedChannels(undefined)) === "[]", "undefined → []");
  assert(JSON.stringify(parseBlockedChannels("")) === "[]", "empty string → []");
  assert(JSON.stringify(parseBlockedChannels("not json")) === "[]", "malformed → []");
  assert(JSON.stringify(parseBlockedChannels("{}")) === "[]", "object → []");
  assert(JSON.stringify(parseBlockedChannels('["sms","voice"]')) === '["sms","voice"]', "valid array parsed");
  assert(JSON.stringify(parseBlockedChannels('["*"]')) === '["*"]', "wildcard parsed");
  assert(JSON.stringify(parseBlockedChannels('[1, "sms", null]')) === '["sms"]', "non-strings filtered out");

  // ------------------------------------------------------------------
  // 2. Unit: isChannelBlocked
  // ------------------------------------------------------------------
  console.log("\nTest: isChannelBlocked");
  assert(isChannelBlocked('["sms"]', "sms") === true, "sms blocked when in list");
  assert(isChannelBlocked('["sms"]', "voice") === false, "voice not blocked when only sms");
  assert(isChannelBlocked('["*"]', "sms") === true, "sms blocked by wildcard");
  assert(isChannelBlocked('["*"]', "voice") === true, "voice blocked by wildcard");
  assert(isChannelBlocked('["*"]', "email") === true, "email blocked by wildcard");
  assert(isChannelBlocked("[]", "sms") === false, "empty array = not blocked");
  assert(isChannelBlocked(null, "sms") === false, "null = not blocked");
  assert(isChannelBlocked('["sms","voice","email"]', "whatsapp") === false, "whatsapp not in list");
  assert(isChannelBlocked('["sms","voice","email"]', "voice") === true, "voice in multi-list");

  // ------------------------------------------------------------------
  // 3. Unit: buildBlockedChannels
  // ------------------------------------------------------------------
  console.log("\nTest: buildBlockedChannels");
  assert(buildBlockedChannels([]) === "[]", "empty → []");
  assert(buildBlockedChannels(["sms"]) === '["sms"]', "single channel");
  assert(buildBlockedChannels(["sms", "sms"]) === '["sms"]', "deduplicates");
  assert(buildBlockedChannels(["*"]) === '["*"]', "wildcard shortcut");
  assert(buildBlockedChannels(["sms", "*"]) === '["*"]', "wildcard overrides individuals");
  assert(buildBlockedChannels(["invalid", "sms"]) === '["sms"]', "invalid channels filtered");
  assert(buildBlockedChannels(["sms", "voice", "email"]) === '["sms","voice","email"]', "multiple valid");

  // ------------------------------------------------------------------
  // 4. API: POST blocked-channels endpoint
  // ------------------------------------------------------------------
  console.log("\nTest: POST blocked-channels API");

  // Block sms for main-receptionist
  const blockRes = await fetch(`${SERVER_URL}/admin/api/agents/main-receptionist/blocked-channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockedChannels: ["sms"] }),
  });
  assert(blockRes.status === 200, "POST returns 200");
  const blockData = await blockRes.json() as Record<string, unknown>;
  assert(blockData.success === true, "Response has success: true");
  assert(JSON.stringify(blockData.blockedChannels) === '["sms"]', "Response echoes blockedChannels");

  // Block all
  const blockAllRes = await fetch(`${SERVER_URL}/admin/api/agents/main-receptionist/blocked-channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockedChannels: ["*"] }),
  });
  assert(blockAllRes.status === 200, "Block-all returns 200");
  const blockAllData = await blockAllRes.json() as Record<string, unknown>;
  assert(JSON.stringify(blockAllData.blockedChannels) === '["*"]', "Block-all echoes [*]");

  // Unblock all
  const unblockRes = await fetch(`${SERVER_URL}/admin/api/agents/main-receptionist/blocked-channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockedChannels: [] }),
  });
  assert(unblockRes.status === 200, "Unblock returns 200");
  const unblockData = await unblockRes.json() as Record<string, unknown>;
  assert(JSON.stringify(unblockData.blockedChannels) === "[]", "Unblock echoes []");

  // Invalid body
  const invalidRes = await fetch(`${SERVER_URL}/admin/api/agents/main-receptionist/blocked-channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockedChannels: "not-array" }),
  });
  assert(invalidRes.status === 400, "Invalid body returns 400");

  // ------------------------------------------------------------------
  // 5. API: GET agents includes blocked_channels
  // ------------------------------------------------------------------
  console.log("\nTest: GET agents includes blocked_channels");
  const agentsRes = await fetch(`${SERVER_URL}/admin/api/agents`);
  assert(agentsRes.status === 200, "Agents API returns 200");
  const agentsData = await agentsRes.json() as Record<string, unknown>;
  const agents = agentsData.agents as Array<Record<string, unknown>>;
  assert(Array.isArray(agents) && agents.length > 0, "Has agents array with data");

  // In demo mode, agents come from demo-data which has blocked_channels: "[]"
  const firstAgent = agents[0];
  assert(firstAgent.blocked_channels !== undefined, "Agent has blocked_channels field");

  // ------------------------------------------------------------------
  // 6. UI: dashboard shows "Provisioned Agents"
  // ------------------------------------------------------------------
  console.log("\nTest: dashboard UI label");

  let cookie = "";
  try {
    const loginRes = await fetch(`${SERVER_URL}/auth/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "inon@95percent.ai", password: "12345678" }),
    });
    const setCookie = loginRes.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
  } catch {}

  const pageHeaders: Record<string, string> = cookie ? { Cookie: cookie } : {};
  const pageRes = await fetch(`${SERVER_URL}/admin`, { headers: pageHeaders, redirect: "follow" });
  const pageHtml = await pageRes.text();
  assert(pageHtml.includes("Provisioned Agents"), "Dashboard shows 'Provisioned Agents' label");
  assert(!pageHtml.includes("Active Agents"), "Dashboard no longer shows 'Active Agents'");

  // Verify JS syntax is clean (openApiKeyModal should be reachable)
  assert(pageHtml.includes("openApiKeyModal"), "Page has openApiKeyModal function");
  assert(pageHtml.includes("saveBlockedChannels"), "Page has saveBlockedChannels function");
  assert(pageHtml.includes("onBlockAllChange"), "Page has onBlockAllChange function");
  assert(pageHtml.includes("badge-error"), "Page has badge-error CSS class");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
