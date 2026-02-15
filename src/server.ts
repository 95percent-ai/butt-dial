import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { getProvider } from "./providers/factory.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerGetMessagesTool } from "./tools/get-messages.js";
import { registerSendVoiceMessageTool } from "./tools/send-voice-message.js";
import { registerMakeCallTool } from "./tools/make-call.js";
import { registerProvisionChannelsTool } from "./tools/provision-channels.js";
import { registerDeprovisionChannelsTool } from "./tools/deprovision-channels.js";
import { registerGetChannelStatusTool } from "./tools/get-channel-status.js";
import { registerRegisterProviderTool } from "./tools/register-provider.js";
import { registerSetAgentLimitsTool } from "./tools/set-agent-limits.js";
import { registerGetUsageDashboardTool } from "./tools/get-usage-dashboard.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: config.mcpServerName,
    version: "0.1.0",
  });

  // Dummy tool — proves the MCP server registers and responds to tool calls
  // Will be replaced by real tools in Phase 2+
  server.tool(
    "comms_ping",
    "Health check tool — returns server status. Used to verify MCP connectivity.",
    {
      message: z.string().optional().describe("Optional message to echo back"),
    },
    async ({ message }) => {
      const db = getProvider("database");
      const poolRows = db.query<{ max_agents: number; active_agents: number }>(
        "SELECT max_agents, active_agents FROM agent_pool WHERE id = ?",
        ["default"]
      );

      const pool = poolRows[0] || { max_agents: 0, active_agents: 0 };

      logger.info("comms_ping", { message });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "ok",
              server: config.mcpServerName,
              version: "0.1.0",
              echo: message || null,
              pool: {
                maxAgents: pool.max_agents,
                activeAgents: pool.active_agents,
                slotsRemaining: pool.max_agents - pool.active_agents,
              },
              providers: {
                telephony: config.providerTelephony,
                email: config.providerEmail,
                whatsapp: config.providerWhatsapp,
                tts: config.providerTts,
                database: config.providerDatabase,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  // Phase 2: Send SMS tool
  registerSendMessageTool(server);

  // Phase 3: Get messages tool
  registerGetMessagesTool(server);

  // Phase 4: Send voice message tool
  registerSendVoiceMessageTool(server);

  // Phase 5: Make call tool (outbound AI voice call)
  registerMakeCallTool(server);

  // Phase 8: Provisioning tools
  registerProvisionChannelsTool(server);
  registerDeprovisionChannelsTool(server);
  registerGetChannelStatusTool(server);
  registerRegisterProviderTool(server);

  // Phase 10: Rate limiting & cost tracking tools
  registerSetAgentLimitsTool(server);
  registerGetUsageDashboardTool(server);

  logger.info("mcp_server_created", { name: config.mcpServerName });

  return server;
}
