/**
 * Seed script — inserts a test agent into the database.
 * Idempotent: skips if agent already exists.
 *
 * Usage: npx tsx src/db/seed.ts
 */

import { randomUUID } from "crypto";
import { createSqliteProvider } from "./client.js";

export function seedTestAgent(db: ReturnType<typeof createSqliteProvider>): void {
  const agentId = "test-agent-001";

  const existing = db.query<{ agent_id: string }>(
    "SELECT agent_id FROM agent_channels WHERE agent_id = ?",
    [agentId]
  );

  if (existing.length > 0) {
    console.log(`Agent "${agentId}" already exists — skipping.`);
    return;
  }

  db.run(
    `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [randomUUID(), agentId, "Test Agent", "+1234567890"]
  );

  console.log(`Seeded agent "${agentId}" with phone +1234567890`);
}

// Run directly as a script
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed.ts")) {
  const db = createSqliteProvider();
  try {
    seedTestAgent(db);
  } finally {
    db.close();
  }
}
