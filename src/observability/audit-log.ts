/**
 * Audit log with SHA-256 hash chain.
 * Each row's hash includes the previous row's hash, making the chain tamper-evident.
 */

import { createHash, randomUUID } from "crypto";

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

export interface AuditEntry {
  eventType: string;
  actor: string;
  target?: string;
  details?: Record<string, unknown>;
  orgId?: string;
}

interface AuditRow {
  id: string;
  timestamp: string;
  event_type: string;
  actor: string;
  target: string | null;
  details: string | null;
  prev_hash: string | null;
  row_hash: string;
}

function computeHash(
  prevHash: string | null,
  timestamp: string,
  eventType: string,
  actor: string,
  target: string | null,
  details: string | null,
): string {
  const payload = `${prevHash ?? ""}|${timestamp}|${eventType}|${actor}|${target ?? ""}|${details ?? ""}`;
  return createHash("sha256").update(payload).digest("hex");
}

/** Append a new entry to the audit log, chaining its hash to the previous row. */
export function appendAuditLog(db: DBProvider, entry: AuditEntry): string {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const detailsJson = entry.details ? JSON.stringify(entry.details) : null;

  // Get the last row's hash for chaining
  const lastRows = db.query<{ row_hash: string }>(
    "SELECT row_hash FROM audit_log ORDER BY timestamp DESC, rowid DESC LIMIT 1"
  );
  const prevHash = lastRows.length > 0 ? lastRows[0].row_hash : null;

  const rowHash = computeHash(prevHash, timestamp, entry.eventType, entry.actor, entry.target ?? null, detailsJson);

  db.run(
    `INSERT INTO audit_log (id, timestamp, event_type, actor, target, details, prev_hash, row_hash, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, timestamp, entry.eventType, entry.actor, entry.target ?? null, detailsJson, prevHash, rowHash, entry.orgId ?? "default"]
  );

  return id;
}

/** Verify the hash chain integrity. Returns { valid, brokenAtIndex? }. */
export function verifyAuditChain(
  db: DBProvider,
  limit?: number,
): { valid: boolean; checkedCount: number; brokenAtIndex?: number } {
  const limitClause = limit ? `LIMIT ${limit}` : "";
  const rows = db.query<AuditRow>(
    `SELECT id, timestamp, event_type, actor, target, details, prev_hash, row_hash FROM audit_log ORDER BY timestamp ASC, rowid ASC ${limitClause}`
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expectedPrevHash = i > 0 ? rows[i - 1].row_hash : null;

    // Check prev_hash pointer
    if (row.prev_hash !== expectedPrevHash) {
      return { valid: false, checkedCount: i + 1, brokenAtIndex: i };
    }

    // Recompute row hash
    const expectedHash = computeHash(
      row.prev_hash,
      row.timestamp,
      row.event_type,
      row.actor,
      row.target,
      row.details,
    );

    if (row.row_hash !== expectedHash) {
      return { valid: false, checkedCount: i + 1, brokenAtIndex: i };
    }
  }

  return { valid: true, checkedCount: rows.length };
}

/** Query audit logs with optional filters. */
export function getAuditLogs(
  db: DBProvider,
  filters?: { eventType?: string; actor?: string; limit?: number },
): AuditRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.eventType) {
    conditions.push("event_type = ?");
    params.push(filters.eventType);
  }
  if (filters?.actor) {
    conditions.push("actor = ?");
    params.push(filters.actor);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 100;

  return db.query<AuditRow>(
    `SELECT id, timestamp, event_type, actor, target, details, prev_hash, row_hash FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ?`,
    [...params, limit]
  );
}
