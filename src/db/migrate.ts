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
