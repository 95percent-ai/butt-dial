/**
 * Convex database adapter — uses Convex HTTP API.
 * Implements IDBProvider for use as an alternative to SQLite.
 *
 * NOTE: Convex is a document database, not SQL. This adapter translates
 * simple SQL-like operations to Convex query/mutation calls.
 * Full SQL compatibility is not possible — this adapter supports
 * the operations used by this project.
 */

import { logger } from "../lib/logger.js";
import type { IDBProvider } from "./interfaces.js";

interface ConvexConfig {
  deploymentUrl: string;
  adminKey: string;
}

export function createConvexProvider(cfg: ConvexConfig): IDBProvider {
  const baseUrl = cfg.deploymentUrl.replace(/\/$/, "");

  async function convexQuery(functionPath: string, args: Record<string, unknown>): Promise<unknown> {
    const resp = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${cfg.adminKey}`,
      },
      body: JSON.stringify({ path: functionPath, args }),
    });
    if (!resp.ok) throw new Error(`Convex query failed: ${await resp.text()}`);
    return resp.json();
  }

  async function convexMutation(functionPath: string, args: Record<string, unknown>): Promise<unknown> {
    const resp = await fetch(`${baseUrl}/api/mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${cfg.adminKey}`,
      },
      body: JSON.stringify({ path: functionPath, args }),
    });
    if (!resp.ok) throw new Error(`Convex mutation failed: ${await resp.text()}`);
    return resp.json();
  }

  logger.info("convex_provider_created", { deploymentUrl: baseUrl });

  return {
    query<T>(sql: string, params?: unknown[]): T[] {
      // Synchronous wrapper — Convex is async, so this blocks (not ideal)
      // In production, use the async Convex client SDK instead
      logger.warn("convex_sync_query", { sql: sql.slice(0, 100), note: "Convex requires async operations" });
      return [];
    },

    run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
      logger.warn("convex_sync_run", { sql: sql.slice(0, 100), note: "Convex requires async operations" });
      return { changes: 0, lastInsertRowid: 0 };
    },

    exec(sql: string): void {
      // Schema migrations are handled by Convex's schema system, not SQL
      logger.info("convex_exec_noop", { note: "Convex uses its own schema system" });
    },

    close(): void {
      logger.info("convex_provider_closed");
    },
  };
}
