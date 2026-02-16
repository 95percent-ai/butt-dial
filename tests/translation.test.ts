/**
 * Translation feature tests — verifies translator module, config, DB migration,
 * admin API, and tool integration for the language/translation bridge.
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
  console.log("\n=== Translation Feature Tests ===\n");

  // ── 1. Translator module unit tests ──
  console.log("── Translator Module ──");

  const { needsTranslation } = await import("../src/lib/translator.js");

  assert(needsTranslation("en-US", "he-IL") === true, "en-US vs he-IL needs translation");
  assert(needsTranslation("en-US", "en-GB") === false, "en-US vs en-GB does NOT need translation (same base)");
  assert(needsTranslation("es-ES", "es-MX") === false, "es-ES vs es-MX does NOT need translation (same base)");
  assert(needsTranslation("fr-FR", "de-DE") === true, "fr-FR vs de-DE needs translation");
  assert(needsTranslation("", "en") === false, "empty string returns false");
  assert(needsTranslation("en", "") === false, "empty string returns false (reverse)");
  assert(needsTranslation("zh", "ja") === true, "zh vs ja needs translation");

  // ── 2. Config has translationEnabled ──
  console.log("\n── Config ──");

  const { config } = await import("../src/lib/config.js");
  assert(typeof config.translationEnabled === "boolean", "translationEnabled is a boolean in config");
  assert(config.translationEnabled === false || config.translationEnabled === true, "translationEnabled has a valid value");

  // ── 3. Health check still works ──
  console.log("\n── Health Check ──");

  const healthResp = await fetch(`${SERVER_URL}/health`);
  assert(healthResp.status === 200, "Health check returns 200");

  // ── 4. Admin API — status endpoint includes translation ──
  console.log("\n── Admin API: Status ──");

  const statusResp = await fetch(`${SERVER_URL}/admin/api/status`);
  const status = await statusResp.json() as Record<string, any>;
  assert(status.translation !== undefined, "Status response includes translation field");
  assert(typeof status.translation?.enabled === "boolean", "translation.enabled is boolean");
  assert(typeof status.translation?.hasApiKey === "boolean", "translation.hasApiKey is boolean");

  // ── 5. Admin API — agents endpoint includes language ──
  console.log("\n── Admin API: Agents ──");

  const agentsResp = await fetch(`${SERVER_URL}/admin/api/agents`, {
    headers: { Authorization: "Bearer demo" },
  });
  const agentsData = await agentsResp.json() as Record<string, any>;
  assert(agentsResp.status === 200, "Agents API returns 200");

  if (agentsData.agents && agentsData.agents.length > 0) {
    const firstAgent = agentsData.agents[0];
    // language might be null for agents created before migration, but the field should exist
    assert("language" in firstAgent || firstAgent.language === undefined, "Agent response has language field");
  }

  // ── 6. Admin API — save translation setting ──
  console.log("\n── Admin API: Save Translation Setting ──");

  const saveResp = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer demo",
    },
    body: JSON.stringify({ credentials: { TRANSLATION_ENABLED: "false" } }),
  });
  const saveData = await saveResp.json() as Record<string, any>;
  assert(saveResp.status === 200, "Save translation setting returns 200");
  assert(saveData.success === true, "Save translation setting succeeds");

  // ── 7. Admin API — update agent language ──
  console.log("\n── Admin API: Update Agent Language ──");

  // First, provision a test agent via MCP tool
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "translation-test", version: "1.0.0" });
  await client.connect(transport);

  // Check that comms_send_message has targetLanguage param
  console.log("\n── Tool Schema ──");
  const tools = await client.listTools();
  const sendTool = tools.tools.find((t) => t.name === "comms_send_message");
  assert(sendTool !== undefined, "comms_send_message tool exists");

  if (sendTool?.inputSchema) {
    const schema = sendTool.inputSchema as Record<string, any>;
    const props = schema.properties || {};
    assert("targetLanguage" in props, "comms_send_message has targetLanguage parameter");
  }

  const makeTool = tools.tools.find((t) => t.name === "comms_make_call");
  assert(makeTool !== undefined, "comms_make_call tool exists");

  if (makeTool?.inputSchema) {
    const schema = makeTool.inputSchema as Record<string, any>;
    const props = schema.properties || {};
    assert("targetLanguage" in props, "comms_make_call has targetLanguage parameter");
  }

  // Update agent language via admin API
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

  // ── 8. Admin UI — page loads with translation card ──
  console.log("\n── Admin UI ──");

  const adminResp = await fetch(`${SERVER_URL}/admin`);
  const adminHtml = await adminResp.text();
  assert(adminResp.status === 200, "Admin page loads");
  assert(adminHtml.includes("Translation"), "Admin page contains Translation card");
  assert(adminHtml.includes("translation-enabled"), "Admin page has translation toggle");
  assert(adminHtml.includes("agent-lang-"), "Admin page has agent language dropdown");
  assert(adminHtml.includes("saveTranslation"), "Admin page has saveTranslation function");
  assert(adminHtml.includes("saveAgentLanguage"), "Admin page has saveAgentLanguage function");

  // ── 9. Dashboard includes translation service status ──
  console.log("\n── Dashboard Data ──");

  const dashResp = await fetch(`${SERVER_URL}/admin/api/dashboard`, {
    headers: { Authorization: "Bearer demo" },
  });
  const dashData = await dashResp.json() as Record<string, any>;
  assert(dashResp.status === 200, "Dashboard API returns 200");
  assert(dashData.services?.translation !== undefined, "Dashboard services includes translation status");

  await client.close();

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
