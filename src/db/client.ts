import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IDBProvider } from "../providers/interfaces.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function createSqliteProvider(dbPath?: string): IDBProvider {
  const resolvedPath = dbPath || path.join(__dirname, "..", "..", "data", "comms.db");

  // Ensure data directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  logger.info("sqlite_connected", { path: resolvedPath });

  return {
    query<T>(sql: string, params?: unknown[]): T[] {
      const stmt = db!.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },

    run(sql: string, params?: unknown[]) {
      const stmt = db!.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },

    exec(sql: string) {
      db!.exec(sql);
    },

    close() {
      if (db) {
        db.close();
        db = null;
        logger.info("sqlite_closed");
      }
    },
  };
}
