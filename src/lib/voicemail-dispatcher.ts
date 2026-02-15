/**
 * Voicemail Dispatcher — sends pending voicemails to agents when they reconnect.
 *
 * When an agent connects via SSE, this module queries voicemail_messages
 * for any pending entries and delivers them as MCP logging notifications.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "./logger.js";

interface VoicemailRow {
  id: string;
  agent_id: string;
  call_sid: string;
  caller_from: string;
  caller_to: string;
  transcript: string | null;
  caller_message: string | null;
  caller_preferences: string | null;
  status: string;
  created_at: string;
}

export async function dispatchPendingVoicemails(
  agentId: string,
  server: Server
): Promise<void> {
  const db = getProvider("database");

  const rows = db.query<VoicemailRow>(
    "SELECT * FROM voicemail_messages WHERE agent_id = ? AND status = 'pending' ORDER BY created_at ASC",
    [agentId]
  );

  if (rows.length === 0) return;

  logger.info("voicemail_dispatch_start", { agentId, count: rows.length });

  for (const row of rows) {
    try {
      const summary = [
        `Voicemail from ${row.caller_from}`,
        row.caller_message ? `Message: ${row.caller_message}` : null,
        row.caller_preferences ? `Preferences: ${row.caller_preferences}` : null,
        row.transcript ? `Full transcript: ${row.transcript}` : null,
        `Received: ${row.created_at}`,
      ]
        .filter(Boolean)
        .join("\n");

      await server.sendLoggingMessage({
        level: "info",
        logger: "voicemail",
        data: {
          type: "voicemail",
          voicemailId: row.id,
          callSid: row.call_sid,
          from: row.caller_from,
          to: row.caller_to,
          message: row.caller_message,
          preferences: row.caller_preferences,
          transcript: row.transcript,
          receivedAt: row.created_at,
          summary,
        },
      });

      db.run(
        "UPDATE voicemail_messages SET status = 'dispatched', dispatched_at = datetime('now') WHERE id = ?",
        [row.id]
      );

      logger.info("voicemail_dispatched", { voicemailId: row.id, agentId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("voicemail_dispatch_error", {
        voicemailId: row.id,
        agentId,
        error: errMsg,
      });
    }
  }
}
