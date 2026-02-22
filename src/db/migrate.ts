import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initProviders, getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const db = getProvider("database");
  // schema files live in src/db/ — resolve from project root
  const projectRoot = path.join(__dirname, "..", "..");
  const schemaPath = path.join(projectRoot, "src", "db", "schema.sql");
  const securitySchemaPath = path.join(projectRoot, "src", "db", "schema-security.sql");

  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  const securitySchema = fs.readFileSync(securitySchemaPath, "utf-8");
  db.exec(securitySchema);

  const rateLimitingSchemaPath = path.join(projectRoot, "src", "db", "schema-rate-limiting.sql");
  const rateLimitingSchema = fs.readFileSync(rateLimitingSchemaPath, "utf-8");
  db.exec(rateLimitingSchema);

  const observabilitySchemaPath = path.join(projectRoot, "src", "db", "schema-observability.sql");
  const observabilitySchema = fs.readFileSync(observabilitySchemaPath, "utf-8");
  db.exec(observabilitySchema);

  // Dead Letter Queue (replaces voicemail_messages)
  const deadLettersSchemaPath = path.join(projectRoot, "src", "db", "schema-dead-letters.sql");
  const deadLettersSchema = fs.readFileSync(deadLettersSchemaPath, "utf-8");
  db.exec(deadLettersSchema);

  // Migrate voicemail_messages → dead_letters (if old table exists)
  try {
    const oldVoicemails = db.query<{ id: string; agent_id: string; call_sid: string; caller_from: string; caller_to: string; transcript: string | null; caller_message: string | null; caller_preferences: string | null; status: string; created_at: string; org_id?: string }>(
      "SELECT * FROM voicemail_messages"
    );
    for (const vm of oldVoicemails) {
      const body = [vm.caller_message, vm.caller_preferences ? `Preferences: ${vm.caller_preferences}` : null, vm.transcript ? `Transcript: ${vm.transcript}` : null].filter(Boolean).join("\n");
      try {
        db.run(
          `INSERT OR IGNORE INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, external_id, status, created_at)
           VALUES (?, ?, ?, 'voice', 'inbound', 'agent_offline', ?, ?, ?, ?, ?, ?)`,
          [vm.id, vm.agent_id, vm.org_id || "default", vm.caller_from, vm.caller_to, body, vm.call_sid, vm.status === "dispatched" ? "acknowledged" : "pending", vm.created_at]
        );
      } catch {
        // Duplicate or other error — skip
      }
    }
  } catch {
    // voicemail_messages table doesn't exist or already migrated — fine
  }

  const callLogsSchemaPath = path.join(projectRoot, "src", "db", "schema-call-logs.sql");
  const callLogsSchema = fs.readFileSync(callLogsSchemaPath, "utf-8");
  db.exec(callLogsSchema);

  const complianceSchemaPath = path.join(projectRoot, "src", "db", "schema-compliance.sql");
  const complianceSchema = fs.readFileSync(complianceSchemaPath, "utf-8");
  db.exec(complianceSchema);

  const billingSchemaPath = path.join(projectRoot, "src", "db", "schema-billing.sql");
  const billingSchema = fs.readFileSync(billingSchemaPath, "utf-8");
  db.exec(billingSchema);

  const otpSchemaPath = path.join(projectRoot, "src", "db", "schema-otp.sql");
  const otpSchema = fs.readFileSync(otpSchemaPath, "utf-8");
  db.exec(otpSchema);

  // Phase 21: Organization multi-tenancy
  const orgSchemaPath = path.join(projectRoot, "src", "db", "schema-org.sql");
  const orgSchema = fs.readFileSync(orgSchemaPath, "utf-8");
  db.exec(orgSchema);

  // Add org_id column to all data tables (idempotent — wrapped in try/catch)
  const orgTables = [
    "agent_channels", "usage_logs", "audit_log", "agent_pool",
    "whatsapp_pool", "call_logs", "dead_letters", "spending_limits",
    "agent_tokens", "provider_credentials", "billing_config",
    "dnc_list", "otp_codes", "erasure_requests",
  ];
  for (const table of orgTables) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN org_id TEXT DEFAULT 'default'`);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // User accounts for registration
  const accountsSchemaPath = path.join(projectRoot, "src", "db", "schema-accounts.sql");
  const accountsSchema = fs.readFileSync(accountsSchemaPath, "utf-8");
  db.exec(accountsSchema);

  // Call Bridging: bridge_registry + bridge_calls tables
  const bridgeSchemaPath = path.join(projectRoot, "src", "db", "schema-bridge.sql");
  const bridgeSchema = fs.readFileSync(bridgeSchemaPath, "utf-8");
  db.exec(bridgeSchema);

  // Number Pool: shared phone numbers for smart outbound routing
  const numberPoolSchemaPath = path.join(projectRoot, "src", "db", "schema-number-pool.sql");
  const numberPoolSchema = fs.readFileSync(numberPoolSchemaPath, "utf-8");
  db.exec(numberPoolSchema);

  // Add language column to agent_channels (for voice STT/TTS language)
  try {
    db.run("ALTER TABLE agent_channels ADD COLUMN language TEXT DEFAULT 'en-US'");
  } catch {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE audit_log ADD COLUMN org_id TEXT DEFAULT 'default'");
  } catch {
    // Column already exists
  }

  // Phase: LINE channel — add line_channel_id and line_status to agent_channels
  try {
    db.run("ALTER TABLE agent_channels ADD COLUMN line_channel_id TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE agent_channels ADD COLUMN line_status TEXT DEFAULT 'pending'");
  } catch {
    // Column already exists
  }

  // Channel blocking — per-channel kill switch without deprovisioning
  try {
    db.run("ALTER TABLE agent_channels ADD COLUMN blocked_channels TEXT DEFAULT '[]'");
  } catch {
    // Column already exists
  }

  // Consent tracking + country terms
  const consentSchemaPath = path.join(projectRoot, "src", "db", "schema-consent.sql");
  const consentSchema = fs.readFileSync(consentSchemaPath, "utf-8");
  db.exec(consentSchema);

  // Disclaimer acceptance tracking
  const disclaimerSchemaPath = path.join(projectRoot, "src", "db", "schema-disclaimer.sql");
  const disclaimerSchema = fs.readFileSync(disclaimerSchemaPath, "utf-8");
  db.exec(disclaimerSchema);

  // Add tos_accepted_at to user_accounts
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN tos_accepted_at TEXT");
  } catch {
    // Column already exists
  }

  // Add mode column to organizations (sandbox | production)
  try {
    db.run("ALTER TABLE organizations ADD COLUMN mode TEXT DEFAULT 'sandbox'");
  } catch {
    // Column already exists
  }

  // Add KYC fields to user_accounts
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN company_name TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN website TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN use_case_description TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN account_status TEXT DEFAULT 'pending_review'");
  } catch {}

  // Add full_name and phone to user_accounts
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN full_name TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE user_accounts ADD COLUMN phone TEXT");
  } catch {}

  // Ensure default organization exists
  try {
    const existing = db.query<{ id: string }>("SELECT id FROM organizations WHERE id = 'default'");
    if (existing.length === 0) {
      db.run(
        "INSERT INTO organizations (id, name, slug) VALUES ('default', 'Default', 'default')"
      );
    }
  } catch {
    // Table might not exist in edge cases
  }

  logger.info("migrations_complete");
}

// Run directly if called as script
const isMain = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  initProviders();
  runMigrations();
  logger.info("migration_script_done");
  getProvider("database").close();
}
