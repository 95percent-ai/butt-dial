/**
 * Provider Management Tests
 *
 * Tests:
 * - Catalog completeness (all providers have required fields, env mappings)
 * - deleteCredentials() unit test
 * - API endpoints: GET /providers, GET /catalog, POST test, POST save, DELETE, POST toggle, GET health
 * - UI presence: provider table renders, add-provider modal renders
 *
 * Prerequisites: Server running with DEMO_MODE=true on localhost:3100
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

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

// ── Catalog Unit Tests ─────────────────────────────────────────────

async function testCatalog() {
  console.log("\n── Catalog Completeness ──");

  // Dynamic import to test the actual module
  const { PROVIDER_CATALOG, getCatalogProvider, getAllCatalogEnvKeys } = await import("../src/admin/provider-catalog.js");

  assert(PROVIDER_CATALOG.length === 11, `Catalog has 11 providers (got ${PROVIDER_CATALOG.length})`);

  // Every provider must have required fields
  for (const p of PROVIDER_CATALOG) {
    assert(!!p.id, `${p.id}: has id`);
    assert(!!p.name, `${p.id}: has name`);
    assert(!!p.type, `${p.id}: has type`);
    assert(!!p.description, `${p.id}: has description`);
    assert(Array.isArray(p.services) && p.services.length > 0, `${p.id}: has services`);
    assert(!!p.costInfo, `${p.id}: has costInfo`);
    assert(Array.isArray(p.fields), `${p.id}: has fields array`);
    assert(typeof p.testable === "boolean", `${p.id}: has testable flag`);

    // Fields must have envKey mappings
    for (const f of p.fields) {
      assert(!!f.key, `${p.id}.${f.key}: has key`);
      assert(!!f.envKey, `${p.id}.${f.key}: has envKey`);
      assert(!!f.label, `${p.id}.${f.key}: has label`);
      assert(f.type === "text" || f.type === "password", `${p.id}.${f.key}: type is text or password`);
    }
  }

  // getCatalogProvider
  assert(getCatalogProvider("twilio")?.name === "Twilio", "getCatalogProvider('twilio') returns Twilio");
  assert(getCatalogProvider("unknown") === undefined, "getCatalogProvider('unknown') returns undefined");

  // getAllCatalogEnvKeys
  const allKeys = getAllCatalogEnvKeys();
  assert(allKeys.includes("TWILIO_ACCOUNT_SID"), "getAllCatalogEnvKeys includes TWILIO_ACCOUNT_SID");
  assert(allKeys.includes("RESEND_API_KEY"), "getAllCatalogEnvKeys includes RESEND_API_KEY");
  assert(allKeys.includes("LINE_CHANNEL_ACCESS_TOKEN"), "getAllCatalogEnvKeys includes LINE_CHANNEL_ACCESS_TOKEN");

  // Edge TTS has no fields
  const edgeTts = getCatalogProvider("edge-tts");
  assert(edgeTts !== undefined && edgeTts.fields.length === 0, "Edge TTS has zero fields");
  assert(edgeTts !== undefined && edgeTts.testable === false, "Edge TTS is not testable");

  // Provider types
  const types = new Set(PROVIDER_CATALOG.map((p) => p.type));
  assert(types.has("telephony"), "Catalog has telephony type");
  assert(types.has("email"), "Catalog has email type");
  assert(types.has("tts"), "Catalog has tts type");
  assert(types.has("stt"), "Catalog has stt type");
  assert(types.has("ai-assistant"), "Catalog has ai-assistant type");
  assert(types.has("messaging"), "Catalog has messaging type");
  assert(types.has("storage"), "Catalog has storage type");
}

// ── deleteCredentials Unit Test ────────────────────────────────────

async function testDeleteCredentials() {
  console.log("\n── deleteCredentials Unit Test ──");

  const ENV_PATH = join(process.cwd(), ".env");
  const BACKUP_PATH = join(process.cwd(), ".env.test-backup");

  // Backup current .env
  if (existsSync(ENV_PATH)) {
    copyFileSync(ENV_PATH, BACKUP_PATH);
  }

  try {
    const { deleteCredentials, saveCredentials } = await import("../src/admin/env-writer.js");

    // Write test keys
    saveCredentials({ TEST_KEY_A: "value_a", TEST_KEY_B: "value_b", TEST_KEY_C: "value_c" });

    // Verify they exist
    let content = readFileSync(ENV_PATH, "utf-8");
    assert(content.includes("TEST_KEY_A=value_a"), "TEST_KEY_A written to .env");
    assert(content.includes("TEST_KEY_B=value_b"), "TEST_KEY_B written to .env");

    // Delete TEST_KEY_B
    deleteCredentials(["TEST_KEY_B"]);
    content = readFileSync(ENV_PATH, "utf-8");
    assert(content.includes("TEST_KEY_A=value_a"), "TEST_KEY_A still in .env after deleting B");
    assert(!content.includes("TEST_KEY_B"), "TEST_KEY_B removed from .env");
    assert(content.includes("TEST_KEY_C=value_c"), "TEST_KEY_C still in .env after deleting B");

    // Delete multiple
    deleteCredentials(["TEST_KEY_A", "TEST_KEY_C"]);
    content = readFileSync(ENV_PATH, "utf-8");
    assert(!content.includes("TEST_KEY_A"), "TEST_KEY_A removed from .env");
    assert(!content.includes("TEST_KEY_C"), "TEST_KEY_C removed from .env");

    // Delete non-existent key (should not throw)
    deleteCredentials(["NON_EXISTENT_KEY_XYZ"]);
    assert(true, "Deleting non-existent key does not throw");
  } finally {
    // Restore backup
    if (existsSync(BACKUP_PATH)) {
      copyFileSync(BACKUP_PATH, ENV_PATH);
      const fs = await import("node:fs");
      fs.unlinkSync(BACKUP_PATH);
    }
  }
}

// ── API Endpoint Tests ─────────────────────────────────────────────

async function testApiEndpoints() {
  console.log("\n── API: GET /admin/api/providers ──");

  const providersRes = await fetch(`${SERVER_URL}/admin/api/providers`);
  assert(providersRes.ok, "GET /providers returns 200");
  const providersData = (await providersRes.json()) as { providers: Array<{ id: string; name: string; type: string; configured: boolean; disabled: boolean; fields: Record<string, string> }> };
  assert(Array.isArray(providersData.providers), "providers is an array");

  // In demo mode with credentials in .env, we should have some providers
  if (providersData.providers.length > 0) {
    const first = providersData.providers[0];
    assert(!!first.id, "First provider has id");
    assert(!!first.name, "First provider has name");
    assert(!!first.type, "First provider has type");
    assert(typeof first.configured === "boolean", "First provider has configured flag");
    assert(typeof first.disabled === "boolean", "First provider has disabled flag");

    // Verify credentials are masked (contain asterisks)
    const fieldValues = Object.values(first.fields || {});
    if (fieldValues.length > 0) {
      assert(fieldValues[0].includes("*"), "Credentials are masked");
    }
  }

  console.log("\n── API: GET /admin/api/providers/catalog ──");

  const catalogRes = await fetch(`${SERVER_URL}/admin/api/providers/catalog`);
  assert(catalogRes.ok, "GET /catalog returns 200");
  const catalogData = (await catalogRes.json()) as { catalog: Array<{ id: string; name: string; type: string; fields: unknown[]; testable: boolean }> };
  assert(Array.isArray(catalogData.catalog), "catalog is an array");
  assert(catalogData.catalog.length === 11, `Catalog has 11 providers (got ${catalogData.catalog.length})`);

  // Verify catalog structure
  const twilio = catalogData.catalog.find((c) => c.id === "twilio");
  assert(twilio !== undefined, "Twilio in catalog");
  assert(twilio!.name === "Twilio", "Twilio has correct name");
  assert(twilio!.type === "telephony", "Twilio type is telephony");
  assert(twilio!.testable === true, "Twilio is testable");
  assert(Array.isArray(twilio!.fields) && twilio!.fields.length === 2, "Twilio has 2 fields");

  console.log("\n── API: POST /admin/api/providers/:id/test ──");

  // Test with invalid credentials — should return success: false
  const testRes = await fetch(`${SERVER_URL}/admin/api/providers/twilio/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountSid: "ACinvalid", authToken: "invalid" }),
  });
  assert(testRes.ok, "POST /providers/twilio/test returns 200");
  const testData = (await testRes.json()) as { success: boolean; message: string };
  assert(typeof testData.success === "boolean", "Test result has success flag");
  assert(typeof testData.message === "string", "Test result has message");

  // Test unknown provider
  const unknownRes = await fetch(`${SERVER_URL}/admin/api/providers/unknown-provider/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(unknownRes.status === 404, "Unknown provider test returns 404");

  // Test non-testable provider (s3)
  const s3TestRes = await fetch(`${SERVER_URL}/admin/api/providers/s3/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(s3TestRes.ok, "S3 test returns 200 (not testable)");
  const s3TestData = (await s3TestRes.json()) as { success: boolean };
  assert(s3TestData.success === true, "S3 test is auto-success (not testable)");

  // Test missing required fields
  const missingRes = await fetch(`${SERVER_URL}/admin/api/providers/twilio/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(missingRes.status === 400, "Missing fields returns 400");

  console.log("\n── API: POST /admin/api/providers/:id/toggle ──");

  // Toggle a provider off
  const toggleRes = await fetch(`${SERVER_URL}/admin/api/providers/elevenlabs/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  assert(toggleRes.ok, "Toggle off returns 200");
  const toggleData = (await toggleRes.json()) as { success: boolean; disabled: boolean };
  assert(toggleData.success === true, "Toggle succeeded");
  assert(toggleData.disabled === true, "Provider marked as disabled");

  // Toggle back on
  const toggleOnRes = await fetch(`${SERVER_URL}/admin/api/providers/elevenlabs/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled: false }),
  });
  assert(toggleOnRes.ok, "Toggle on returns 200");
  const toggleOnData = (await toggleOnRes.json()) as { success: boolean; disabled: boolean };
  assert(toggleOnData.disabled === false, "Provider re-enabled");

  console.log("\n── API: GET /admin/api/providers/:id/health ──");

  // Health check for a configured provider
  const healthRes = await fetch(`${SERVER_URL}/admin/api/providers/edge-tts/health`);
  assert(healthRes.ok, "Health check returns 200");
  const healthData = (await healthRes.json()) as { success: boolean; message: string };
  assert(healthData.success === true, "Edge TTS health check passes (no credentials needed)");

  // Health check for unknown provider
  const healthUnknown = await fetch(`${SERVER_URL}/admin/api/providers/unknown/health`);
  assert(healthUnknown.status === 404, "Unknown provider health returns 404");

  console.log("\n── API: DELETE /admin/api/providers/:id ──");

  // Delete edge-tts (no fields — should fail)
  const delEdge = await fetch(`${SERVER_URL}/admin/api/providers/edge-tts`, { method: "DELETE" });
  assert(delEdge.status === 400, "Delete Edge TTS returns 400 (no fields to remove)");

  // Delete unknown provider
  const delUnknown = await fetch(`${SERVER_URL}/admin/api/providers/unknown`, { method: "DELETE" });
  assert(delUnknown.status === 404, "Delete unknown returns 404");
}

// ── UI Presence Tests ──────────────────────────────────────────────

async function testUiPresence() {
  console.log("\n── UI: Admin Page ──");

  // Import the render function directly to get the admin HTML
  // (the /admin route redirects to login in demo mode without a session)
  const { renderAdminPage } = await import("../src/admin/unified-admin.js");
  const html = renderAdminPage("{}");

  // Check for provider table markup
  assert(html.includes("providers-table"), "HTML contains providers-table");
  assert(html.includes("providers-body"), "HTML contains providers-body");
  assert(html.includes("add-provider-modal"), "HTML contains add-provider-modal");
  assert(html.includes("provider-catalog-grid"), "HTML contains provider-catalog-grid");
  assert(html.includes("provider-step-catalog"), "HTML contains provider-step-catalog");
  assert(html.includes("provider-step-configure"), "HTML contains provider-step-configure");
  assert(html.includes("loadProviders"), "HTML contains loadProviders function");
  assert(html.includes("openAddProvider"), "HTML contains openAddProvider function");
  assert(html.includes("editProvider"), "HTML contains editProvider function");
  assert(html.includes("deleteProvider"), "HTML contains deleteProvider function");
  assert(html.includes("toggleProvider"), "HTML contains toggleProvider function");

  // Configuration cards still exist
  assert(html.includes("card-voice"), "HTML contains voice config card");
  assert(html.includes("card-disclosure"), "HTML contains AI disclosure card");
  assert(html.includes("card-email-verification"), "HTML contains email verification card");
  assert(html.includes("card-server"), "HTML contains server config card");
  assert(html.includes("deploy-btn"), "HTML contains deploy button");

  // Old provider cards should NOT exist
  assert(!html.includes('id="card-twilio"'), "Old Twilio card removed");
  assert(!html.includes('id="card-resend"'), "Old Resend card removed");
  assert(!html.includes('id="card-tts"'), "Old TTS card removed");
  assert(!html.includes('id="twilio-sid"'), "Old twilio-sid input removed");
  assert(!html.includes('id="resend-key"'), "Old resend-key input removed");
  assert(!html.includes('testTwilio()'), "Old testTwilio function removed");
  assert(!html.includes('testResend()'), "Old testResend function removed");
  assert(!html.includes('saveComms()'), "Old saveComms function removed");
}

// ── Backward Compatibility ─────────────────────────────────────────

async function testBackwardCompat() {
  console.log("\n── Backward Compatibility ──");

  // Old /admin/api/status endpoint still works
  const statusRes = await fetch(`${SERVER_URL}/admin/api/status`);
  assert(statusRes.ok, "GET /admin/api/status still returns 200");

  // Old test endpoints still work
  const testTwilioRes = await fetch(`${SERVER_URL}/admin/api/test/twilio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountSid: "ACtest", authToken: "test" }),
  });
  assert(testTwilioRes.ok, "POST /admin/api/test/twilio still works");

  // Old save endpoint still works
  const saveRes = await fetch(`${SERVER_URL}/admin/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: { VOICE_DEFAULT_LANGUAGE: "en-US" } }),
  });
  assert(saveRes.ok, "POST /admin/api/save still works");
}

// ── Run All ────────────────────────────────────────────────────────

async function main() {
  console.log("Provider Management Tests");
  console.log("=".repeat(50));

  // Verify server is running
  try {
    const healthRes = await fetch(`${SERVER_URL}/health`);
    if (!healthRes.ok) throw new Error("Health check failed");
  } catch {
    console.error("Server not running at " + SERVER_URL);
    console.error("Start with: DEMO_MODE=true node dist/index.js");
    process.exit(1);
  }

  await testCatalog();
  await testDeleteCredentials();
  await testApiEndpoints();
  await testUiPresence();
  await testBackwardCompat();

  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
