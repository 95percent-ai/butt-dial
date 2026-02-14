import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../lib/config.js";
import { handleInboundSms } from "./inbound-sms.js";
import { handleInboundVoice, handleOutboundVoice } from "./inbound-voice.js";

export const webhookRouter = Router();

// Health check — liveness probe
webhookRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    version: "0.1.0",
    environment: config.nodeEnv,
    demoMode: config.demoMode,
  });
});

// Inbound SMS webhook — Twilio POSTs here when someone texts the agent's number
webhookRouter.post("/webhooks/:agentId/sms", handleInboundSms);

// Voice webhooks — Twilio POSTs here when a call connects
webhookRouter.post("/webhooks/:agentId/voice", handleInboundVoice);
webhookRouter.post("/webhooks/:agentId/outbound-voice", handleOutboundVoice);

// Readiness probe — checks provider connectivity (expanded in Phase 11)
webhookRouter.get("/health/ready", (_req: Request, res: Response) => {
  res.json({
    status: "ready",
    providers: {
      database: "ok",
    },
  });
});
