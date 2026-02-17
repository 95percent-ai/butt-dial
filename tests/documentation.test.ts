/**
 * Dry test for Phase 19 — Documentation.
 *
 * Verifies all documentation files exist and have content.
 *
 * Usage: npx tsx tests/documentation.test.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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

function checkFile(filePath: string, label: string, minLength: number = 100) {
  const fullPath = path.join(ROOT, filePath);
  const exists = fs.existsSync(fullPath);
  assert(exists, `${label} exists`);
  if (exists) {
    const content = fs.readFileSync(fullPath, "utf-8");
    assert(content.length >= minLength, `${label} has content (${content.length} chars)`);
  }
}

async function main() {
  console.log("\n=== Phase 19: Documentation dry test ===\n");

  // ------------------------------------------------------------------
  // 1. README
  // ------------------------------------------------------------------
  console.log("Test: README");
  checkFile("README.md", "README.md");
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf-8");
  assert(readme.includes("Butt-Dial") || readme.includes("Communication MCP"), "README mentions project name");
  assert(readme.includes("Quick Start"), "README has Quick Start section");
  assert(readme.includes("MCP Tools"), "README has MCP Tools section");

  // ------------------------------------------------------------------
  // 2. Setup guide
  // ------------------------------------------------------------------
  console.log("\nTest: SETUP.md");
  checkFile("docs/SETUP.md", "SETUP.md");

  // ------------------------------------------------------------------
  // 3. API reference
  // ------------------------------------------------------------------
  console.log("\nTest: API.md");
  checkFile("docs/API.md", "API.md");
  const api = fs.readFileSync(path.join(ROOT, "docs/API.md"), "utf-8");
  assert(api.includes("/health"), "API docs cover /health");
  assert(api.includes("/sse"), "API docs cover /sse");
  assert(api.includes("/webhooks"), "API docs cover webhooks");

  // ------------------------------------------------------------------
  // 4. MCP Tools reference
  // ------------------------------------------------------------------
  console.log("\nTest: MCP-TOOLS.md");
  checkFile("docs/MCP-TOOLS.md", "MCP-TOOLS.md");
  const tools = fs.readFileSync(path.join(ROOT, "docs/MCP-TOOLS.md"), "utf-8");
  assert(tools.includes("comms_send_message"), "Tools doc covers send_message");
  assert(tools.includes("comms_make_call"), "Tools doc covers make_call");
  assert(tools.includes("comms_get_billing_summary"), "Tools doc covers billing");
  assert(tools.includes("comms_provision_channels"), "Tools doc covers provisioning");

  // ------------------------------------------------------------------
  // 5. Providers guide
  // ------------------------------------------------------------------
  console.log("\nTest: PROVIDERS.md");
  checkFile("docs/PROVIDERS.md", "PROVIDERS.md");
  const providers = fs.readFileSync(path.join(ROOT, "docs/PROVIDERS.md"), "utf-8");
  assert(providers.includes("ITelephonyProvider"), "Providers doc covers telephony interface");
  assert(providers.includes("Twilio"), "Providers doc covers Twilio");
  assert(providers.includes("Vonage"), "Providers doc covers Vonage");

  // ------------------------------------------------------------------
  // 6. Security guide
  // ------------------------------------------------------------------
  console.log("\nTest: SECURITY.md");
  checkFile("docs/SECURITY.md", "SECURITY.md");
  const security = fs.readFileSync(path.join(ROOT, "docs/SECURITY.md"), "utf-8");
  assert(security.includes("Authentication"), "Security doc covers authentication");
  assert(security.includes("Rate Limiting"), "Security doc covers rate limiting");
  assert(security.includes("Compliance"), "Security doc covers compliance");

  // ------------------------------------------------------------------
  // 7. Observability guide
  // ------------------------------------------------------------------
  console.log("\nTest: OBSERVABILITY.md");
  checkFile("docs/OBSERVABILITY.md", "OBSERVABILITY.md");
  const obs = fs.readFileSync(path.join(ROOT, "docs/OBSERVABILITY.md"), "utf-8");
  assert(obs.includes("/metrics"), "Observability doc covers metrics");
  assert(obs.includes("Audit Log"), "Observability doc covers audit log");
  assert(obs.includes("Alert"), "Observability doc covers alerts");

  // ------------------------------------------------------------------
  // 8. Architecture guide
  // ------------------------------------------------------------------
  console.log("\nTest: ARCHITECTURE.md");
  checkFile("docs/ARCHITECTURE.md", "ARCHITECTURE.md");

  // ------------------------------------------------------------------
  // 9. Troubleshooting guide
  // ------------------------------------------------------------------
  console.log("\nTest: TROUBLESHOOTING.md");
  checkFile("docs/TROUBLESHOOTING.md", "TROUBLESHOOTING.md");
  const trouble = fs.readFileSync(path.join(ROOT, "docs/TROUBLESHOOTING.md"), "utf-8");
  assert(trouble.includes("EADDRINUSE"), "Troubleshooting covers port conflict");
  assert(trouble.includes("429"), "Troubleshooting covers rate limiting");
  assert(trouble.includes("DEMO_MODE"), "Troubleshooting covers demo mode");

  // ------------------------------------------------------------------
  // 10. Existing docs still present
  // ------------------------------------------------------------------
  console.log("\nTest: existing docs");
  checkFile("docs/SPEC.md", "SPEC.md");
  checkFile("docs/TODO.md", "TODO.md");
  checkFile("docs/DECISIONS.md", "DECISIONS.md");
  checkFile("docs/STRUCTURE.md", "STRUCTURE.md");
  checkFile("docs/CHANGELOG.md", "CHANGELOG.md");
  checkFile("docs/ONBOARDING.md", "ONBOARDING.md");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(
    `\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
