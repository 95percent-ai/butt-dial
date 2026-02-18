/**
 * Tests for Regulatory Compliance & Distribution Model (Phase 25).
 *
 * F1: Legal pages (render, links)
 * F2: Country compliance rules
 * F3: Consent tracking (record, revoke, check, STOP keyword)
 * F4: Sandbox-to-production gating
 * F5: Edition gating
 * F6: Data retention
 * F7: Full regression (existing tools work)
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/regulatory-compliance.test.ts
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
let total = 0;

function assert(condition: boolean, label: string) {
  total++;
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text || "{}";
  return { ...result, parsed: JSON.parse(text) };
}

async function main() {
  console.log("\n=== Regulatory Compliance & Distribution Model Tests ===\n");

  // ── F1: Legal Pages ─────────────────────────────────────────────
  console.log("F1: Legal Pages");

  // Terms of Service
  const termsRes = await fetch(`${SERVER_URL}/legal/terms`);
  assert(termsRes.status === 200, "GET /legal/terms returns 200");
  const termsHtml = await termsRes.text();
  assert(termsHtml.includes("Terms of Service"), "Terms page contains title");
  assert(termsHtml.includes("95percent.ai"), "Terms page mentions company");
  assert(termsHtml.includes("TCPA"), "Terms page mentions TCPA compliance");

  // Acceptable Use Policy
  const aupRes = await fetch(`${SERVER_URL}/legal/aup`);
  assert(aupRes.status === 200, "GET /legal/aup returns 200");
  const aupHtml = await aupRes.text();
  assert(aupHtml.includes("Acceptable Use Policy"), "AUP page contains title");
  assert(aupHtml.includes("Prohibited Uses"), "AUP page has prohibited uses section");

  // Privacy Policy
  const privacyRes = await fetch(`${SERVER_URL}/legal/privacy`);
  assert(privacyRes.status === 200, "GET /legal/privacy returns 200");
  const privacyHtml = await privacyRes.text();
  assert(privacyHtml.includes("Privacy Policy"), "Privacy page contains title");
  assert(privacyHtml.includes("GDPR"), "Privacy page mentions GDPR");
  assert(privacyHtml.includes("CCPA"), "Privacy page mentions CCPA");

  // Landing page has legal footer links
  const landingRes = await fetch(`${SERVER_URL}/`);
  const landingHtml = await landingRes.text();
  assert(landingHtml.includes("/legal/terms"), "Landing page has Terms link");
  assert(landingHtml.includes("/legal/privacy"), "Landing page has Privacy link");
  assert(landingHtml.includes("/legal/aup"), "Landing page has AUP link");

  // Cross-links between legal pages
  assert(termsHtml.includes("/legal/aup"), "Terms page links to AUP");
  assert(termsHtml.includes("/legal/privacy"), "Terms page links to Privacy");

  // ── F2: Country Compliance Rules ─────────────────────────────────
  console.log("\nF2: Country Compliance Rules");

  // Import the module directly
  const { getCountryRules, getAllCountryRules, isEuCountry, validateCountryRequirements } =
    await import("../dist/lib/country-compliance.js");

  // US rules
  const usRules = getCountryRules("US");
  assert(usRules.code === "US", "US country code correct");
  assert(usRules.requiresConsent === true, "US requires consent");
  assert(usRules.requiresA2pRegistration === true, "US requires A2P registration");
  assert(usRules.requiresDncCheck === true, "US requires DNC check");
  assert(usRules.callingHours !== null, "US has calling hours restriction");
  assert(usRules.callingHours!.start === 8, "US calling hours start at 8am");
  assert(usRules.callingHours!.end === 21, "US calling hours end at 9pm");
  assert(usRules.regulations.includes("TCPA"), "US has TCPA regulation");
  assert(usRules.regulations.includes("A2P 10DLC"), "US has A2P 10DLC regulation");

  // Canada rules
  const caRules = getCountryRules("CA");
  assert(caRules.regulations.includes("CASL"), "Canada has CASL regulation");

  // UK rules
  const gbRules = getCountryRules("GB");
  assert(gbRules.regulations.includes("UK GDPR"), "UK has UK GDPR regulation");
  assert(gbRules.regulations.includes("TPS"), "UK has TPS regulation");

  // Israel rules
  const ilRules = getCountryRules("IL");
  assert(ilRules.code === "IL", "Israel country code correct");
  assert(ilRules.requiresConsent === true, "Israel requires consent");

  // EU countries
  assert(isEuCountry("DE") === true, "Germany is EU");
  assert(isEuCountry("FR") === true, "France is EU");
  assert(isEuCountry("US") === false, "US is not EU");
  assert(isEuCountry("GB") === false, "UK is not EU");

  // Generic EU rules
  const plRules = getCountryRules("PL");
  assert(plRules.regulations.includes("GDPR"), "Poland has GDPR");
  assert(plRules.regulations.includes("ePrivacy Directive"), "Poland has ePrivacy Directive");

  // Default rules for unknown country
  const unknownRules = getCountryRules("ZZ");
  assert(unknownRules.requiresConsent === true, "Unknown country defaults to requiring consent");
  assert(unknownRules.requiresOptOutProcessing === true, "Unknown country defaults to opt-out processing");

  // Country validation
  const usValidation = validateCountryRequirements("US");
  assert(usValidation.passed === false, "US validation fails without A2P registration");
  assert(usValidation.blockers.length > 0, "US has blockers without A2P");

  const usValidationWithA2p = validateCountryRequirements("US", { hasA2pRegistration: true });
  assert(usValidationWithA2p.passed === true, "US validation passes with A2P registration");
  assert(usValidationWithA2p.warnings.length > 0, "US still has warnings");

  // All rules
  const allRules = getAllCountryRules();
  assert(allRules.length >= 30, `At least 30 country rules configured (got ${allRules.length})`);

  // ── F3: Consent Tracking ─────────────────────────────────────────
  console.log("\nF3: Consent Tracking");

  // Connect MCP client
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "test-consent", version: "1.0.0" });
  await client.connect(transport);

  // Check tools exist
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  assert(toolNames.includes("comms_record_consent"), "comms_record_consent tool registered");
  assert(toolNames.includes("comms_revoke_consent"), "comms_revoke_consent tool registered");
  assert(toolNames.includes("comms_check_consent"), "comms_check_consent tool registered");

  // Record consent
  const recordResult = await callTool(client, "comms_record_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "sms",
    consentType: "express",
    source: "web_form",
    notes: "Test consent",
  });
  assert(recordResult.parsed.success === true, "Record consent succeeds");
  assert(recordResult.parsed.status === "granted", "Consent status is granted");

  // Check consent
  const checkResult = await callTool(client, "comms_check_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "sms",
  });
  assert(checkResult.parsed.hasConsent === true, "Check consent returns true");
  assert(checkResult.parsed.consentType === "express", "Consent type is express");

  // Revoke consent
  const revokeResult = await callTool(client, "comms_revoke_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "sms",
  });
  assert(revokeResult.parsed.success === true, "Revoke consent succeeds");
  assert(revokeResult.parsed.status === "revoked", "Consent status is revoked");

  // Check after revocation
  const checkAfterRevoke = await callTool(client, "comms_check_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "sms",
  });
  assert(checkAfterRevoke.parsed.hasConsent === false, "Consent is false after revocation");

  // Re-record consent (upsert)
  const reRecordResult = await callTool(client, "comms_record_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "sms",
    consentType: "implied",
    source: "verbal",
  });
  assert(reRecordResult.parsed.success === true, "Re-recording consent succeeds");

  // Check no-consent for different channel
  const checkVoice = await callTool(client, "comms_check_consent", {
    agentId: "test-agent-001",
    contactAddress: "+15551234567",
    channel: "voice",
  });
  assert(checkVoice.parsed.hasConsent === false, "No consent for unconsented channel");

  // DB: consent table exists and has records
  const db = new Database(DB_PATH, { readonly: true });
  const consentRows = db.prepare("SELECT COUNT(*) as cnt FROM contact_consent").get() as { cnt: number };
  assert(consentRows.cnt >= 1, `Consent table has records (${consentRows.cnt})`);

  // DB: country_terms_accepted table exists
  try {
    db.prepare("SELECT COUNT(*) FROM country_terms_accepted").get();
    assert(true, "country_terms_accepted table exists");
  } catch {
    assert(false, "country_terms_accepted table exists");
  }

  // ── F4: Sandbox-to-Production Gating ─────────────────────────────
  console.log("\nF4: Sandbox-to-Production Gating");

  // Check organizations table has mode column
  try {
    const orgMode = db.prepare("SELECT mode FROM organizations WHERE id = 'default'").get() as { mode: string } | undefined;
    assert(orgMode !== undefined, "Organizations table has mode column");
    assert(orgMode!.mode === "sandbox" || orgMode!.mode === "production", `Org mode is valid (${orgMode!.mode})`);
  } catch {
    assert(false, "Organizations table has mode column");
    assert(false, "Org mode is valid");
  }

  // Test sandbox provider getter
  const { getOrgMode, getProviderForOrg } = await import("../dist/providers/factory.js");
  const defaultMode = getOrgMode("default");
  assert(defaultMode === "sandbox" || defaultMode === "production", `getOrgMode returns valid mode (${defaultMode})`);

  // ── F5: Edition Gating ────────────────────────────────────────────
  console.log("\nF5: Edition Gating");

  // In demo mode, all tools should be available regardless of edition
  assert(toolNames.includes("comms_ping"), "comms_ping tool available");
  assert(toolNames.includes("comms_send_message"), "comms_send_message tool available");
  assert(toolNames.includes("comms_make_call"), "comms_make_call tool available");
  assert(toolNames.includes("comms_provision_channels"), "comms_provision_channels tool available");
  assert(toolNames.includes("comms_get_messages"), "comms_get_messages tool available");
  assert(toolNames.includes("comms_transfer_call"), "comms_transfer_call tool available");

  // Config has edition field
  const healthRes = await fetch(`${SERVER_URL}/health`);
  assert(healthRes.status === 200, "Health check passes with edition config");

  // ── F6: Data Retention ────────────────────────────────────────────
  console.log("\nF6: Data Retention");

  // Import and test data retention module
  const { runDataRetentionCleanup, loadRetentionConfig } = await import("../dist/lib/data-retention.js");

  const retentionConfig = loadRetentionConfig();
  assert(retentionConfig.messagesRetentionDays === 90, "Default messages retention is 90 days");
  assert(retentionConfig.usageLogsRetentionDays === 365, "Default usage logs retention is 365 days");
  assert(retentionConfig.callLogsRetentionDays === 365, "Default call logs retention is 365 days");
  assert(retentionConfig.voicemailRetentionDays === 30, "Default voicemail retention is 30 days");
  assert(retentionConfig.otpRetentionDays === 1, "Default OTP retention is 1 day");
  assert(retentionConfig.revokedConsentRetentionDays === 730, "Default revoked consent retention is 730 days");
  assert(retentionConfig.enabled === true, "Data retention is enabled by default");

  // Create a minimal IDBProvider wrapper for testing
  const testDb = new Database(DB_PATH);
  const dbWrapper = {
    query: <T>(sql: string, params?: unknown[]): T[] => testDb.prepare(sql).all(...(params || [])) as T[],
    run: (sql: string, params?: unknown[]) => testDb.prepare(sql).run(...(params || [])),
    exec: (sql: string) => testDb.exec(sql),
    close: () => testDb.close(),
  };

  // Run cleanup (should not delete anything recent)
  const cleanupResult = runDataRetentionCleanup(dbWrapper as any, { enabled: true });
  assert(typeof cleanupResult.totalDeleted === "number", "Cleanup returns totalDeleted count");
  assert(typeof cleanupResult.details === "object", "Cleanup returns details object");

  // Disabled retention does nothing
  const disabledResult = runDataRetentionCleanup(dbWrapper as any, { enabled: false });
  assert(disabledResult.totalDeleted === 0, "Disabled retention deletes nothing");

  testDb.close();

  // ── F7: Regression ────────────────────────────────────────────────
  console.log("\nF7: Regression — Existing Tools");

  // Ping
  const ping = await callTool(client, "comms_ping", { message: "regression check" });
  assert(ping.parsed.status === "ok", "comms_ping works");
  assert(ping.parsed.echo === "regression check", "Ping echoes message");

  // Send message (demo mode)
  const send = await callTool(client, "comms_send_message", {
    agentId: "test-agent-001",
    channel: "sms",
    to: "+15559876543",
    body: "Regression test message",
  });
  assert(send.parsed.success === true || send.parsed.messageId, "comms_send_message works");

  // Get messages
  const msgs = await callTool(client, "comms_get_messages", {
    agentId: "test-agent-001",
    limit: 5,
  });
  assert(Array.isArray(msgs.parsed.messages), "comms_get_messages returns array");

  // Health endpoint
  const health = await fetch(`${SERVER_URL}/health`);
  assert(health.status === 200, "Health endpoint returns 200");

  // Metrics endpoint
  const metricsRes = await fetch(`${SERVER_URL}/metrics`);
  assert(metricsRes.status === 200, "Metrics endpoint returns 200");

  // KYC fields on user_accounts
  try {
    db.prepare("SELECT company_name, website, use_case_description, account_status, tos_accepted_at FROM user_accounts LIMIT 1").all();
    assert(true, "user_accounts has KYC fields");
  } catch {
    assert(false, "user_accounts has KYC fields");
  }

  // Cleanup
  db.close();
  await client.close();

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
