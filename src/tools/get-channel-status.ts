/**
 * comms_get_channel_status — MCP tool to query channel state for an agent.
 * Returns per-channel info, message counts, and pool status.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireAgent, resolveAgentId, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";

interface AgentRow {
  agent_id: string;
  display_name: string | null;
  phone_number: string | null;
  whatsapp_sender_sid: string | null;
  whatsapp_status: string;
  email_address: string | null;
  voice_id: string | null;
  status: string;
  provisioned_at: string;
}

interface CountRow {
  cnt: number;
}

interface PoolRow {
  max_agents: number;
  active_agents: number;
}

export function registerGetChannelStatusTool(server: McpServer): void {
  server.tool(
    "comms_get_channel_status",
    "Get the current channel status for an agent — phone, WhatsApp, email, voice, message counts, and pool info.",
    {
      agentId: z.string().optional().describe("Agent ID (auto-detected from agent token if omitted)"),
    },
    async ({ agentId: explicitAgentId }, extra) => {
      const agentId = resolveAgentId(extra.authInfo as AuthInfo | undefined, explicitAgentId);
      if (!agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "agentId is required (or use an agent token)" }) }], isError: true };
      }

      // Auth: agent can only view their own status
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      // Look up agent
      const rows = db.query<AgentRow>(
        "SELECT agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, status, provisioned_at FROM agent_channels WHERE agent_id = ?",
        [agentId]
      );

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Agent "${agentId}" not found` }) }],
          isError: true,
        };
      }

      const agent = rows[0];

      // Action counts per channel (from usage_logs)
      const smsCounts = db.query<CountRow>(
        "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'sms'",
        [agentId]
      );
      const emailCounts = db.query<CountRow>(
        "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'email'",
        [agentId]
      );
      const whatsappCounts = db.query<CountRow>(
        "SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'whatsapp'",
        [agentId]
      );

      // Pool info
      const poolRows = db.query<PoolRow>(
        "SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'"
      );
      const pool = poolRows[0] || { max_agents: 0, active_agents: 0 };

      logger.info("channel_status_queried", { agentId, status: agent.status });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            agentId,
            displayName: agent.display_name,
            status: agent.status,
            provisionedAt: agent.provisioned_at,
            channels: {
              phone: agent.phone_number
                ? { number: agent.phone_number, status: agent.status, messageCount: smsCounts[0]?.cnt ?? 0 }
                : null,
              whatsapp: agent.whatsapp_sender_sid
                ? { senderSid: agent.whatsapp_sender_sid, status: agent.whatsapp_status, messageCount: whatsappCounts[0]?.cnt ?? 0 }
                : null,
              email: agent.email_address
                ? { address: agent.email_address, status: agent.status, messageCount: emailCounts[0]?.cnt ?? 0 }
                : null,
              voiceAi: agent.voice_id
                ? { voiceId: agent.voice_id, status: agent.status }
                : null,
            },
            pool: {
              maxAgents: pool.max_agents,
              activeAgents: pool.active_agents,
              slotsRemaining: pool.max_agents - pool.active_agents,
            },
          }, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_get_channel_status" });
}
