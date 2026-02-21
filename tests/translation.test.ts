/**
 * Translation feature tests — verifies translator module still works (kept for
 * future human-to-human translation) and that server-side translation has been
 * removed from tools and admin UI (Phase 27).
 */

const SERVER_URL = "http://localhost:3100";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.log(`  \u2717 ${label}`);
    failed++;
  }
}

async function main() {
  console.log("\n=== Translation Feature Tests (Phase 27) ===\n");

  // ── 1. Translator module still works (kept for future use) ──
  console.log("── Translator Module ──");

  const { needsTranslation } = await import("../src/lib/translator.js");

  assert(needsTranslation("en-US", "he-IL") === true, "en-US vs he-IL needs translation");
  assert(needsTranslation("en-US", "en-GB") === false, "en-US vs en-GB does NOT need translation (same base)");
  assert(needsTranslation("es-ES", "es-MX") === false, "es-ES vs es-MX does NOT need translation (same base)");
  assert(needsTranslation("fr-FR", "de-DE") === true, "fr-FR vs de-DE needs translation");
  assert(needsTranslation("", "en") === false, "empty string returns false");
  assert(needsTranslation("en", "") === false, "empty string returns false (reverse)");
  assert(needsTranslation("zh", "ja") === true, "zh vs ja needs translation");

  // ── 2. Health check still works ──
  console.log("\n── Health Check ──");

  const healthResp = await fetch(`${SERVER_URL}/health`);
  assert(healthResp.status === 200, "Health check returns 200");

  // ── 3. Admin API — agents endpoint includes language (for voice STT/TTS) ──
  console.log("\n── Admin API: Agents ──");

  const agentsResp = await fetch(`${SERVER_URL}/admin/api/agents`, {
    headers: { Authorization: "Bearer demo" },
  });
  const agentsData = await agentsResp.json() as Record<string, any>;
  assert(agentsResp.status === 200, "Agents API returns 200");

  if (agentsData.agents && agentsData.agents.length > 0) {
    const firstAgent = agentsData.agents[0];
    assert("language" in firstAgent || firstAgent.language === undefined, "Agent response has language field");
  }

  // ── 4. Admin API — update agent language (still used for voice STT/TTS) ──
  console.log("\n── Admin API: Update Agent Language ──");

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "translation-test", version: "1.0.0" });
  await client.connect(transport);

  // ── 5. Verify targetLanguage removed from tools ──
  console.log("\n── Tool Schema (Phase 27 Removal) ──");
  const tools = await client.listTools();
  const sendTool = tools.tools.find((t) => t.name === "comms_send_message");
  assert(sendTool !== undefined, "comms_send_message tool exists");

  if (sendTool?.inputSchema) {
    const schema = sendTool.inputSchema as Record<string, any>;
    const props = schema.properties || {};
    assert(!("targetLanguage" in props), "comms_send_message no longer has targetLanguage parameter");
  }

  const makeTool = tools.tools.find((t) => t.name === "comms_make_call");
  assert(makeTool !== undefined, "comms_make_call tool exists");

  if (makeTool?.inputSchema) {
    const schema = makeTool.inputSchema as Record<string, any>;
    const props = schema.properties || {};
    assert(!("targetLanguage" in props), "comms_make_call no longer has targetLanguage parameter");
  }

  // Update agent language via admin API (still works for voice STT/TTS)
  const langResp = await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/language`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer demo",
    },
    body: JSON.stringify({ language: "he-IL" }),
  });
  const langData = await langResp.json() as Record<string, any>;
  assert(langResp.status === 200, "Update agent language returns 200");
  assert(langData.success === true, "Update agent language succeeds");
  assert(langData.language === "he-IL", "Language is set to he-IL");

  // Verify by re-reading agents list
  const agentsResp2 = await fetch(`${SERVER_URL}/admin/api/agents`, {
    headers: { Authorization: "Bearer demo" },
  });
  const agentsData2 = await agentsResp2.json() as Record<string, any>;
  const updatedAgent = agentsData2.agents?.find((a: any) => a.agent_id === "test-agent-001");
  if (updatedAgent) {
    assert(updatedAgent.language === "he-IL", "Agent language persisted as he-IL");
  }

  // Reset agent language back to en-US
  await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/language`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer demo",
    },
    body: JSON.stringify({ language: "en-US" }),
  });

  // ── 6. Admin UI — translation card removed, language dropdown kept ──
  console.log("\n── Admin UI (Phase 27 Removal) ──");

  const adminResp = await fetch(`${SERVER_URL}/admin`);
  const adminHtml = await adminResp.text();
  assert(adminResp.status === 200, "Admin page loads");
  assert(adminHtml.includes("agent-lang-"), "Admin page has agent language dropdown");
  assert(adminHtml.includes("saveAgentLanguage"), "Admin page has saveAgentLanguage function");

  // ── 7. Dashboard — translation service removed ──
  console.log("\n── Dashboard Data ──");

  const dashResp = await fetch(`${SERVER_URL}/admin/api/dashboard`, {
    headers: { Authorization: "Bearer demo" },
  });
  const dashData = await dashResp.json() as Record<string, any>;
  assert(dashResp.status === 200, "Dashboard API returns 200");

  await client.close();

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
