/**
 * comms_get_waiting_messages — MCP tool for retrieving undelivered messages.
 *
 * Returns pending dead letters for the agent and auto-marks them as acknowledged.
 * Fetch = acknowledge — no separate ack step needed.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";

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
  original_request: string | null;
  error_details: string | null;
  external_id: string | null;
  status: string;
  created_at: string;
}

export function registerWaitingMessagesTool(server: McpServer): void {
  server.tool(
    "comms_get_waiting_messages",
    "Get undelivered messages (failed sends, messages received while offline). Auto-acknowledges on fetch.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
      channel: z.enum(["sms", "whatsapp", "email", "voice", "line"]).optional().describe("Filter by channel"),
      limit: z.number().default(50).describe("Max number of messages to return (default 50)"),
    },
    async ({ agentId: explicitAgentId, channel, limit }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");
      const authInfo = extra.authInfo as AuthInfo | undefined;
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      let sql = "SELECT * FROM dead_letters WHERE agent_id = ? AND status = 'pending'";
      const params: unknown[] = [agentId];

      if (channel) {
        sql += " AND channel = ?";
        params.push(channel);
      }

      sql += " ORDER BY created_at ASC LIMIT ?";
      params.push(limit);

      const rows = db.query<DeadLetterRow>(sql, params);

      // Auto-acknowledge all fetched messages
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        for (const id of ids) {
          db.run(
            "UPDATE dead_letters SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?",
            [id]
          );
        }
      }

      logger.info("get_waiting_messages", { agentId, channel, count: rows.length });

      const messages = rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        channel: r.channel,
        direction: r.direction,
        reason: r.reason,
        from: r.from_address,
        to: r.to_address,
        body: r.body,
        mediaUrl: r.media_url,
        originalRequest: r.original_request ? JSON.parse(r.original_request) : null,
        errorDetails: r.error_details,
        externalId: r.external_id,
        createdAt: r.created_at,
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ messages, count: messages.length, acknowledged: messages.length }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_waiting_messages" });
}
