import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { initProviders } from "./providers/factory.js";
import { runMigrations } from "./db/migrate.js";
import { createMcpServer } from "./server.js";
import { webhookRouter } from "./webhooks/router.js";
import { adminRouter } from "./admin/router.js";

async function main() {
  // 1. Initialize providers (DB first)
  initProviders();

  // 2. Run database migrations
  runMigrations();

  // 3. Create Express app
  const app = express();

  // 4. MCP SSE endpoint (before body parsers — transport reads raw stream)
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    logger.info("mcp_sse_connection");

    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    res.on("close", () => {
      transports.delete(transport.sessionId);
      logger.info("mcp_sse_disconnected", { sessionId: transport.sessionId });
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(400).json({ error: "Unknown session" });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // 5. Body parsers + routes (after MCP so transport gets raw stream)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(webhookRouter);
  app.use(adminRouter);

  // 7. Start server
  app.listen(config.port, () => {
    logger.info("server_started", {
      port: config.port,
      mcpEndpoint: "/sse",
      healthEndpoint: "/health",
      environment: config.nodeEnv,
      demoMode: config.demoMode,
    });
  });
}

main().catch((err) => {
  logger.error("startup_failed", { error: String(err) });
  process.exit(1);
});
