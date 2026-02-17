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

  // Insert agent with all fields populated
  db.run(
    `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, email_address, system_prompt, greeting, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      randomUUID(),
      agentId,
      "Test Agent",
      "+1234567890",
      "+1234567890",
      "test-agent-001@agents.example.com",
      "You are a helpful test agent. Keep responses concise and friendly.",
      "Hello! I'm the test agent. How can I help you today?",
    ]
  );

  // Insert default spending limits
  db.run(
    `INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month)
     VALUES (?, ?, 10, 100, 500, 10.0, 100.0)`,
    [randomUUID(), agentId]
  );

  console.log("");
  console.log("Seeded test agent:");
  console.log(`  Agent ID:      ${agentId}`);
  console.log(`  Display Name:  Test Agent`);
  console.log(`  Phone:         +1234567890`);
  console.log(`  WhatsApp:      +1234567890`);
  console.log(`  Email:         test-agent-001@agents.example.com`);
  console.log(`  Greeting:      Hello! I'm the test agent. How can I help you today?`);
  console.log(`  Limits:        10/min, 100/hr, 500/day, $10/day, $100/month`);
  console.log("");
}

export function seedSnirAgent(db: ReturnType<typeof createSqliteProvider>): void {
  const agentId = "snir-agent";

  const existing = db.query<{ agent_id: string }>(
    "SELECT agent_id FROM agent_channels WHERE agent_id = ?",
    [agentId]
  );

  if (existing.length > 0) {
    console.log(`Agent "${agentId}" already exists — skipping.`);
    return;
  }

  db.run(
    `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, email_address, system_prompt, greeting, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      randomUUID(),
      agentId,
      "Snir Agent",
      "+972502629999",
      "+972502629999",
      "sz@aidg.com",
      "You are Snir's AI assistant. Keep responses concise and professional.",
      "Hi! I'm Snir's assistant. How can I help?",
    ]
  );

  db.run(
    `INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month)
     VALUES (?, ?, 10, 100, 500, 25.0, 200.0)`,
    [randomUUID(), agentId]
  );

  console.log("");
  console.log("Seeded Snir agent:");
  console.log(`  Agent ID:      ${agentId}`);
  console.log(`  Display Name:  Snir Agent`);
  console.log(`  Phone:         +972502629999`);
  console.log(`  WhatsApp:      +972502629999`);
  console.log(`  Email:         sz@aidg.com`);
  console.log(`  Limits:        10/min, 100/hr, 500/day, $25/day, $200/month`);
  console.log("");
}

// Run directly as a script
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed.ts")) {
  const db = createSqliteProvider();
  try {
    seedTestAgent(db);
    seedSnirAgent(db);
  } finally {
    db.close();
  }
}
