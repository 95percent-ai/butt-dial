import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { handleInboundSms } from "./inbound-sms.js";
import { handleInboundVoice, handleOutboundVoice } from "./inbound-voice.js";
import { handleInboundEmail } from "./inbound-email.js";
import { handleInboundWhatsApp } from "./inbound-whatsapp.js";
import { verifyTwilioSignature, verifyResendSignature } from "../security/webhook-signature.js";
import { metrics } from "../observability/metrics.js";

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
webhookRouter.post("/webhooks/:agentId/sms", verifyTwilioSignature, handleInboundSms);

// Inbound email webhook — Resend POSTs here when someone emails the agent's address
webhookRouter.post("/webhooks/:agentId/email", verifyResendSignature, handleInboundEmail);

// Inbound WhatsApp webhook — Twilio POSTs here when someone sends WhatsApp to agent's number
webhookRouter.post("/webhooks/:agentId/whatsapp", verifyTwilioSignature, handleInboundWhatsApp);

// Voice webhooks — Twilio POSTs here when a call connects
webhookRouter.post("/webhooks/:agentId/voice", verifyTwilioSignature, handleInboundVoice);
webhookRouter.post("/webhooks/:agentId/outbound-voice", verifyTwilioSignature, handleOutboundVoice);

// Prometheus metrics endpoint
webhookRouter.get("/metrics", (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(metrics.getPrometheusText());
});

// Readiness probe — real connectivity checks
webhookRouter.get("/health/ready", (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};
  let allOk = true;

  // Database: real query
  try {
    const db = getProvider("database");
    db.query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
    allOk = false;
  }

  // Provider config presence checks (not live API pings — those would be slow)
  checks.telephony = config.twilioAccountSid ? "configured" : "not_configured";
  checks.email = config.resendApiKey ? "configured" : "not_configured";
  checks.whatsapp = config.twilioAccountSid ? "configured" : "not_configured";

  const status = allOk ? "ready" : "degraded";
  res.status(allOk ? 200 : 503).json({ status, providers: checks });
});
