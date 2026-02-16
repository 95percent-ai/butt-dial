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

  const voicemailSchemaPath = path.join(projectRoot, "src", "db", "schema-voicemail.sql");
  const voicemailSchema = fs.readFileSync(voicemailSchemaPath, "utf-8");
  db.exec(voicemailSchema);

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
    "agent_channels", "messages", "usage_logs", "audit_log", "agent_pool",
    "whatsapp_pool", "call_logs", "voicemail_messages", "spending_limits",
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

  // Phase 22: Translation — add language column to agent_channels, body_original + source_language to messages
  try {
    db.run("ALTER TABLE agent_channels ADD COLUMN language TEXT DEFAULT 'en-US'");
  } catch {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE messages ADD COLUMN body_original TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE messages ADD COLUMN source_language TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.run("ALTER TABLE audit_log ADD COLUMN org_id TEXT DEFAULT 'default'");
  } catch {
    // Column already exists
  }

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
