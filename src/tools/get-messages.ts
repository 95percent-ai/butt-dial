/**
 * comms_get_messages — MCP tool for listing messages for an agent.
 * Returns messages ordered by newest first, with optional channel filter.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

interface MessageRow {
  id: string;
  agent_id: string;
  channel: string;
  direction: string;
  from_address: string;
  to_address: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  external_id: string | null;
  status: string;
  cost: number | null;
  created_at: string;
}

export function registerGetMessagesTool(server: McpServer): void {
  server.tool(
    "comms_get_messages",
    "List messages for an agent, newest first. Optionally filter by channel.",
    {
      agentId: z.string().describe("The agent ID to list messages for"),
      limit: z.number().default(20).describe("Max number of messages to return (default 20)"),
      channel: z.enum(["sms", "whatsapp", "email", "voice"]).optional().describe("Filter by channel"),
    },
    async ({ agentId, limit, channel }) => {
      const db = getProvider("database");

      let sql = "SELECT * FROM messages WHERE agent_id = ?";
      const params: unknown[] = [agentId];

      if (channel) {
        sql += " AND channel = ?";
        params.push(channel);
      }

      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);

      const rows = db.query<MessageRow>(sql, params);

      logger.info("get_messages", { agentId, channel, limit, count: rows.length });

      const messages = rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        channel: r.channel,
        direction: r.direction,
        from: r.from_address,
        to: r.to_address,
        body: r.body,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        externalId: r.external_id,
        status: r.status,
        cost: r.cost,
        createdAt: r.created_at,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ messages, count: messages.length }, null, 2),
          },
        ],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_messages" });
}
