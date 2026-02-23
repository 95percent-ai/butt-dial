/**
 * Message Dispatcher — sends pending dead-letter messages to agents when they reconnect.
 *
 * When an agent connects via SSE, this module queries dead_letters
 * for any pending entries and delivers them as MCP logging notifications.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "./logger.js";
import { getAgentGender } from "./gender-context.js";

interface DeadLetterRow {
  id: string;
  agent_id: string;
  org_id: string;
  channel: string;
  direction: string;
  reason: string;
  from_address: string | null;
  to_address: string | null;
  body: string | null;
  media_url: string | null;
  error_details: string | null;
  external_id: string | null;
  status: string;
  created_at: string;
}

export async function dispatchPendingMessages(
  agentId: string,
  server: Server
): Promise<void> {
  const db = getProvider("database");

  const rows = db.query<DeadLetterRow>(
    "SELECT * FROM dead_letters WHERE agent_id = ? AND status = 'pending' ORDER BY created_at ASC",
    [agentId]
  );

  if (rows.length === 0) return;

  const agentGender = getAgentGender(db, agentId);

  logger.info("message_dispatch_start", { agentId, count: rows.length });

  for (const row of rows) {
    try {
      const summary = [
        `${row.channel.toUpperCase()} ${row.direction} from ${row.from_address || "unknown"}`,
        row.reason !== "agent_offline" ? `Reason: ${row.reason}` : null,
        row.body ? `Message: ${row.body}` : null,
        row.error_details ? `Error: ${row.error_details}` : null,
        `Received: ${row.created_at}`,
      ]
        .filter(Boolean)
        .join("\n");

      await server.sendLoggingMessage({
        level: "info",
        logger: "waiting-message",
        data: {
          type: "waiting-message",
          messageId: row.id,
          channel: row.channel,
          direction: row.direction,
          reason: row.reason,
          from: row.from_address,
          to: row.to_address,
          body: row.body,
          mediaUrl: row.media_url,
          externalId: row.external_id,
          receivedAt: row.created_at,
          agentGender,
          summary,
        },
      });

      db.run(
        "UPDATE dead_letters SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?",
        [row.id]
      );

      logger.info("message_dispatched", { messageId: row.id, agentId, channel: row.channel });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("message_dispatch_error", {
        messageId: row.id,
        agentId,
        error: errMsg,
      });
    }
  }
}
