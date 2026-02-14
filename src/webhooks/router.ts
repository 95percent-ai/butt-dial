import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../lib/config.js";
import { handleInboundSms } from "./inbound-sms.js";
import { handleInboundVoice, handleOutboundVoice } from "./inbound-voice.js";
import { handleInboundEmail } from "./inbound-email.js";
import { handleInboundWhatsApp } from "./inbound-whatsapp.js";

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

// Inbound email webhook — Resend POSTs here when someone emails the agent's address
webhookRouter.post("/webhooks/:agentId/email", handleInboundEmail);

// Inbound WhatsApp webhook — Twilio POSTs here when someone sends WhatsApp to agent's number
webhookRouter.post("/webhooks/:agentId/whatsapp", handleInboundWhatsApp);

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
