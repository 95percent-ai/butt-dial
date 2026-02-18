import http from "http";
import express from "express";
import path from "path";
import { WebSocketServer } from "ws";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { initProviders, getProvider } from "./providers/factory.js";
import { runMigrations } from "./db/migrate.js";
import { createMcpServer } from "./server.js";
import { webhookRouter } from "./webhooks/router.js";
import { adminRouter } from "./admin/router.js";
import { handleVoiceWebSocket } from "./webhooks/voice-ws.js";
import { authMiddleware } from "./security/auth-middleware.js";
import { metrics } from "./observability/metrics.js";
import { initAlertManager } from "./observability/alert-manager.js";
import { registerAgentSession, unregisterAgentSession } from "./lib/agent-registry.js";
import { dispatchPendingVoicemails } from "./lib/voicemail-dispatcher.js";
import { securityHeaders } from "./security/security-headers.js";
import { corsMiddleware } from "./security/cors.js";
import { httpRateLimiter } from "./security/http-rate-limiter.js";
import { ipFilter } from "./security/ip-filter.js";
import { startAnomalyDetector } from "./security/anomaly-detector.js";
import { cleanupExpiredOtps } from "./security/otp.js";
import { renderLandingPage } from "./public/landing-page.js";
import { renderDocsPage } from "./public/docs.js";
import { renderAuthPage } from "./public/auth-page.js";
import { authApiRouter } from "./public/auth-api.js";
import { restRouter } from "./api/rest-router.js";

async function main() {
  // 1. Initialize providers (DB first)
  initProviders();

  // 2. Run database migrations
  runMigrations();

  // 2b. Initialize observability
  const db = getProvider("database");
  initAlertManager(db);

  // 2c. Start anomaly detector
  startAnomalyDetector(db);

  // 3. Create Express app
  const app = express();

  // 3a. Security middleware (before routes)
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(httpRateLimiter);

  // 4. MCP SSE endpoint (before body parsers — transport reads raw stream)
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    logger.info("mcp_sse_connection", { agentId });

    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    res.on("close", () => {
      transports.delete(transport.sessionId);
      if (agentId) {
        unregisterAgentSession(agentId);
      }
      logger.info("mcp_sse_disconnected", { sessionId: transport.sessionId, agentId });
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);

    // Register agent session so voice calls can route to this agent's LLM
    if (agentId) {
      registerAgentSession(agentId, {
        server: mcpServer.server,
        sessionId: transport.sessionId,
        connectedAt: new Date(),
      });

      // Deliver any voicemails collected while agent was offline
      dispatchPendingVoicemails(agentId, mcpServer.server).catch((err) => {
        logger.error("voicemail_dispatch_failed", { agentId, error: String(err) });
      });
    }
  });

  app.post("/messages", authMiddleware, async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(400).json({ error: "Unknown session" });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // 5. Body parsers + routes (after MCP so transport gets raw stream)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // 6. Static file serving for audio storage (Twilio fetches audio from here)
  app.use("/storage", express.static(path.resolve("storage")));

  // Landing page
  app.get("/", (_req, res) => { res.type("html").send(renderLandingPage()); });

  // Documentation pages
  app.get("/docs", (_req, res) => { res.type("html").send(renderDocsPage()); });
  app.get("/docs/:page", (req, res) => {
    const html = renderDocsPage(req.params.page);
    if (!html) return res.status(404).type("html").send(renderDocsPage("home")!);
    res.type("html").send(html);
  });

  // Auth pages + API
  app.get("/auth/login", (_req, res) => { res.type("html").send(renderAuthPage()); });
  app.use("/auth/api", authApiRouter);

  // REST API v1
  app.use("/api/v1", restRouter);

  app.use(webhookRouter);
  app.use("/admin", ipFilter("admin"));
  app.use(adminRouter);

  // 7. Wrap Express with http.createServer for WebSocket support
  const server = http.createServer(app);

  // 8. WebSocket server (noServer mode — we handle upgrade routing manually)
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url || "";

    // Route voice WebSocket connections: /webhooks/:agentId/voice-ws
    if (/\/webhooks\/[^/]+\/voice-ws/.test(url)) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleVoiceWebSocket(ws, req);
      });
    } else {
      // Not a recognized WebSocket path — reject
      socket.destroy();
    }
  });

  // 9. Start server
  server.listen(config.port, () => {
    logger.info("server_started", {
      port: config.port,
      mcpEndpoint: "/sse",
      healthEndpoint: "/health",
      voiceWsEndpoint: "/webhooks/:agentId/voice-ws",
      environment: config.nodeEnv,
      demoMode: config.demoMode,
    });

    // 10. Uptime gauge — update every 15 seconds
    setInterval(() => {
      metrics.gauge("mcp_uptime_seconds", process.uptime());
    }, 15_000);
    metrics.gauge("mcp_uptime_seconds", process.uptime());

    // 11. OTP cleanup — every 5 minutes
    setInterval(() => {
      try { cleanupExpiredOtps(db); } catch {}
    }, 5 * 60 * 1000);
  });
}

main().catch((err) => {
  logger.error("startup_failed", { error: String(err) });
  process.exit(1);
});
