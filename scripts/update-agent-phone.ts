import { createSqliteProvider } from "../src/db/client.js";

const newPhone = process.argv[2] || "+18777804236";

const db = createSqliteProvider();
const result = db.run(
  "UPDATE agent_channels SET phone_number = ? WHERE agent_id = ?",
  [newPhone, "test-agent-001"]
);
console.log("Updated rows:", result.changes);
const row = db.query<{ agent_id: string; phone_number: string }>(
  "SELECT agent_id, phone_number FROM agent_channels WHERE agent_id = ?",
  ["test-agent-001"]
);
console.log("Agent now:", row[0]);
db.close();
