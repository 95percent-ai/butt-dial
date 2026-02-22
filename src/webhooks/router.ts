import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../lib/config.js";
import { getProvider } from "../providers/factory.js";
import { handleInboundSms } from "./inbound-sms.js";
import { handleInboundVoice, handleOutboundVoice } from "./inbound-voice.js";
import { handleInboundEmail } from "./inbound-email.js";
import { handleInboundWhatsApp } from "./inbound-whatsapp.js";
import { handleInboundLine } from "./inbound-line.js";
import { handleBridgeStatus } from "./bridge-status.js";
import type { IDBProvider } from "../providers/interfaces.js";
import { verifyTwilioSignature, verifyResendSignature } from "../security/webhook-signature.js";
import { updateUsageCost } from "../security/rate-limiter.js";
import { logger } from "../lib/logger.js";
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

// Inbound LINE webhook — LINE POSTs here when someone sends a message to agent's LINE Official Account
webhookRouter.post("/webhooks/:agentId/line", handleInboundLine);

// Voice webhooks — Twilio POSTs here when a call connects
// TODO: re-enable verifyTwilioSignature after fixing signature mismatch with ngrok
webhookRouter.post("/webhooks/:agentId/voice", handleInboundVoice);
webhookRouter.post("/webhooks/:agentId/outbound-voice", handleOutboundVoice);

// ── Shared call-status handler ──────────────────────────────────────
function handleCallStatus(req: Request, res: Response): void {
  const body = req.body as Record<string, string>;
  const callSid = body.CallSid;
  const callStatus = body.CallStatus;
  const duration = body.CallDuration ? parseInt(body.CallDuration, 10) : undefined;
  const isTerminal = callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer";

  if (callSid && callStatus) {
    try {
      const db = getProvider("database");
      const updates: string[] = [`status = '${callStatus === "completed" ? "completed" : callStatus}'`];
      if (duration != null) updates.push(`duration_seconds = ${duration}`);
      if (isTerminal) {
        updates.push(`ended_at = datetime('now')`);
      }
      db.run(`UPDATE call_logs SET ${updates.join(", ")} WHERE call_sid = ?`, [callSid]);

      // Fire-and-forget: fetch cost from Twilio after terminal status
      if (isTerminal && !config.demoMode && config.twilioAccountSid && config.twilioAuthToken) {
        fetchAndRecordCallCost(callSid, db).catch(() => {});
      }
    } catch {
      // Best-effort logging
    }
  }

  res.status(200).type("text/xml").send("<Response/>");
}

// ── Fetch call cost from Twilio REST API ────────────────────────────
async function fetchAndRecordCallCost(callSid: string, db: IDBProvider): Promise<void> {
  try {
    const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls/${callSid}.json`;
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!resp.ok) {
      logger.warn("twilio_call_fetch_failed", { callSid, status: resp.status });
      return;
    }
    const data = await resp.json() as { price?: string | null; price_unit?: string };
    if (data.price != null) {
      const cost = Math.abs(parseFloat(data.price));
      db.run("UPDATE call_logs SET cost = ? WHERE call_sid = ?", [cost, callSid]);
      updateUsageCost(db, callSid, cost);
      logger.info("call_cost_recorded", { callSid, cost, currency: data.price_unit ?? "USD" });
    }
  } catch (err) {
    logger.warn("call_cost_fetch_error", { callSid, error: String(err) });
  }
}

// Call status callback — Twilio POSTs here when call status changes (for call_logs)
webhookRouter.post("/webhooks/:agentId/call-status", verifyTwilioSignature, handleCallStatus);

// Voice status callback (alternate path — Twilio sends status updates here)
webhookRouter.post("/webhooks/:agentId/voice/status", handleCallStatus);

// Bridge call status callback — Twilio POSTs here when bridge call legs change state
webhookRouter.post("/webhooks/bridge-status", handleBridgeStatus);

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
  checks.line = config.lineChannelAccessToken ? "configured" : "not_configured";

  const status = allOk ? "ready" : "degraded";
  res.status(allOk ? 200 : 503).json({ status, providers: checks });
});
