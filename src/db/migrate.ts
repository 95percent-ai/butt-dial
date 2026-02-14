import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initProviders, getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const db = getProvider("database");
  // schema.sql lives in src/db/ — resolve from project root
  const projectRoot = path.join(__dirname, "..", "..");
  const schemaPath = path.join(projectRoot, "src", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  db.exec(schema);
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
