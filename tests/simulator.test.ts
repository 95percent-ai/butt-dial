/**
 * Simulator Tests — API endpoints, walkthrough scenarios, UI presence, regression.
 * Run with: DEMO_MODE=true node dist/index.js  (in one terminal)
 *           npx tsx tests/simulator.test.ts       (in another terminal)
 */

const BASE = process.env.TEST_URL || "http://localhost:3100";
const TOKEN = process.env.ORCHESTRATOR_SECURITY_TOKEN || process.env.MASTER_SECURITY_TOKEN || process.env.TEST_TOKEN || "test-token-123";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
    ...(opts.headers as Record<string, string> || {}),
  };
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

async function main() {
  console.log("\n=== Simulator Tests ===\n");

  // ── API: GET /admin/api/simulator/tools ────────────────────
  console.log("-- Tool Registry API --");
  {
    const res = await apiFetch("/admin/api/simulator/tools");
    const data = await res.json() as any;
    assert(res.ok, "GET /admin/api/simulator/tools returns 200");
    assert(Array.isArray(data.tools), "tools is an array");
    assert(data.tools.length === 18, `tools has 18 entries (got ${data.tools.length})`);
    assert(data.toolCount === 18, "toolCount is 18");
    assert(typeof data.hasLlm === "boolean", "hasLlm is boolean");
    assert(typeof data.categories === "object", "categories object present");

    // Check categories
    const cats = Object.keys(data.categories);
    assert(cats.includes("System"), "System category present");
    assert(cats.includes("Messaging"), "Messaging category present");
    assert(cats.includes("Voice"), "Voice category present");
    assert(cats.includes("Verification"), "Verification category present");
    assert(cats.includes("Provisioning"), "Provisioning category present");
    assert(cats.includes("Admin"), "Admin category present");
    assert(cats.includes("Billing"), "Billing category present");
  }

  // ── API: POST /admin/api/simulator/execute (comms_ping) ────
  console.log("\n-- Execute Tool API --");
  {
    const res = await apiFetch("/admin/api/simulator/execute", {
      method: "POST",
      body: JSON.stringify({ tool: "comms_ping", args: { message: "test" } }),
    });
    const data = await res.json() as any;
    assert(res.ok, "Execute comms_ping returns 200");
    assert(!data.isError, "comms_ping is not an error");
    assert(typeof data.durationMs === "number", "durationMs is a number");
    assert(data.tool === "comms_ping", "tool name echoed back");
    assert(data.result?.status === "ok", "ping result has status ok");
  }

  // ── Execute comms_send_message (demo mode) ─────────────────
  {
    const res = await apiFetch("/admin/api/simulator/execute", {
      method: "POST",
      body: JSON.stringify({
        tool: "comms_send_message",
        args: { agentId: "agent-001", to: "+15551234567", body: "test", channel: "sms" },
      }),
    });
    const data = await res.json() as any;
    assert(res.ok, "Execute comms_send_message returns 200");
    assert(data.tool === "comms_send_message", "tool name is comms_send_message");
  }

  // ── Execute invalid tool ───────────────────────────────────
  {
    const res = await apiFetch("/admin/api/simulator/execute", {
      method: "POST",
      body: JSON.stringify({ tool: "invalid_tool_name", args: {} }),
    });
    assert(res.status === 400, "Invalid tool returns 400");
    const data = await res.json() as any;
    assert(data.error?.includes("Unknown tool"), "Error mentions unknown tool");
  }

  // ── Execute missing tool field ─────────────────────────────
  {
    const res = await apiFetch("/admin/api/simulator/execute", {
      method: "POST",
      body: JSON.stringify({ args: {} }),
    });
    assert(res.status === 400, "Missing tool field returns 400");
  }

  // ── Walkthrough: each scenario's first step executes ───────
  console.log("\n-- Walkthrough Scenarios --");

  const scenarioFirstSteps = [
    { tool: "comms_ping", args: { message: "health check" }, label: "System Health" },
    { tool: "comms_onboard_customer", args: { displayName: "Test", email: "t@t.com", enableSms: true, enableEmail: true, enableVoice: true }, label: "Onboard & Message" },
    { tool: "comms_send_voice_message", args: { agentId: "agent-001", to: "+15551234567", message: "test" }, label: "Voice Calls" },
    { tool: "comms_send_otp", args: { agentId: "agent-001", to: "+15551234567", channel: "sms" }, label: "OTP Verification" },
    { tool: "comms_get_usage_dashboard", args: { agentId: "agent-001" }, label: "Usage & Billing" },
    { tool: "comms_register_provider", args: { provider: "twilio", credentials: { accountSid: "ACtest", authToken: "tok" }, verify: false }, label: "Provider & History" },
    { tool: "comms_expand_agent_pool", args: { newSize: 10 }, label: "Infrastructure" },
  ];

  for (const scenario of scenarioFirstSteps) {
    const res = await apiFetch("/admin/api/simulator/execute", {
      method: "POST",
      body: JSON.stringify({ tool: scenario.tool, args: scenario.args }),
    });
    assert(res.ok, `Scenario "${scenario.label}" first step executes (${scenario.tool})`);
  }

  // ── UI: Admin page includes Simulator ──────────────────────
  console.log("\n-- UI Presence --");
  {
    const res = await fetch(`${BASE}/admin`);
    const html = await res.text();
    assert(html.includes("Simulator"), "Admin page contains 'Simulator' text");
    assert(html.includes('data-tab="simulator"'), "Sidebar has simulator tab link");
    assert(html.includes("sim-mode-btn"), "Mode toggle buttons present");
    assert(html.includes("sim-chat"), "Chat panel present");
    assert(html.includes("sim-walkthrough"), "Walkthrough panel present");
    assert(html.includes("sim-playground"), "Playground panel present");
    assert(html.includes("pg-tool-select"), "Tool dropdown element present");
  }

  // ── Regression: existing admin tabs still work ─────────────
  console.log("\n-- Regression --");
  {
    const res = await fetch(`${BASE}/admin`);
    const html = await res.text();
    assert(html.includes('data-tab="dashboard"'), "Dashboard tab still present");
    assert(html.includes('data-tab="settings"'), "Settings tab still present");
    assert(html.includes('data-tab="agents"'), "Agents tab still present");
    assert(html.includes('data-tab="docs"'), "Docs tab still present");
  }

  // ── Regression: dashboard API still works ──────────────────
  {
    const res = await apiFetch("/admin/api/dashboard");
    assert(res.ok, "Dashboard API still returns 200");
  }

  // ── Regression: status API still works ─────────────────────
  {
    const res = await apiFetch("/admin/api/status");
    assert(res.ok, "Status API still returns 200");
  }

  // ── Summary ────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
