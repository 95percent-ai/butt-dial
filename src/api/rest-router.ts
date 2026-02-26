/**
 * REST API v1 Router — thin HTTP wrappers around the same providers used by MCP tools.
 *
 * All endpoints use Bearer token auth (orchestrator / org / agent — same 3-tier as MCP).
 * OpenAPI 3.1 spec served at GET /api/v1/openapi.json.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../security/auth-middleware.js";
import {
  requireAgent,
  requireAdmin,
  getOrgId,
  resolveAgentId,
  AuthError,
  type AuthInfo,
} from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { sanitize, SanitizationError } from "../security/sanitizer.js";
import {
  checkRateLimits,
  logUsage,
  RateLimitError,
  getAgentLimits,
} from "../security/rate-limiter.js";
import { preSendCheck, checkTcpaTimeOfDay, checkDnc, checkContentFilter } from "../security/compliance.js";
import { getAgentLanguage } from "../lib/translator.js";
import { resolveFromNumber } from "../lib/number-pool.js";
import { getAgentGender, buildGenderInstructions } from "../lib/gender-context.js";
import { maybeTriggerSandboxReply } from "../lib/sandbox-responder.js";
import { storeCallConfig } from "../webhooks/voice-sessions.js";
import { applyGuardrails, applyDisclosure } from "../security/communication-guardrails.js";
import { metrics } from "../observability/metrics.js";
import { orgFilter } from "../security/org-scope.js";
import {
  getBillingSummary,
  getAgentBillingConfig,
  setAgentBillingConfig,
  getAvailableTiers,
  getTierLimits,
} from "../lib/billing.js";
import { searchAndBuyNumber, configureNumberWebhooks, releasePhoneNumber } from "../provisioning/phone-number.js";
import { assignFromPool, returnToPool } from "../provisioning/whatsapp-sender.js";
import { generateEmailAddress, requestDomainVerification } from "../provisioning/email-identity.js";
import { generateToken, storeToken, revokeAgentTokens } from "../security/token-manager.js";
import { appendAuditLog } from "../observability/audit-log.js";
import { isChannelBlocked } from "../lib/channel-blocker.js";

export const restRouter = Router();

// ── Public endpoints (no auth) ────────────────────────────────────────

restRouter.get("/openapi.json", (_req, res) => {
  res.json(generateRestOpenApiSpec());
});

restRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    version: "1.0.0",
    mode: config.demoMode ? "demo" : "live",
  });
});

/** Integration guide as raw markdown — public, no auth */
restRouter.get("/integration-guide", async (_req, res) => {
  try {
    const { readFile } = await import("fs/promises");
    const { resolve } = await import("path");
    const guidePath = resolve(process.cwd(), "docs", "INTEGRATION.md");
    const content = await readFile(guidePath, "utf-8");
    res.type("text/markdown").send(content);
  } catch {
    res.status(404).type("text/plain").send("Integration guide not found. Ensure docs/INTEGRATION.md exists.");
  }
});

// ── Auth middleware for all remaining endpoints ───────────────────────
restRouter.use(authMiddleware);

// ── Helpers ───────────────────────────────────────────────────────────

function authInfo(req: Express.Request): AuthInfo | undefined {
  if (!req.auth) return undefined;
  return {
    token: req.auth.token,
    clientId: req.auth.clientId,
    scopes: req.auth.scopes,
    orgId: req.auth.orgId,
  };
}

function errorJson(res: Express.Response & { status: Function; json: Function }, status: number, message: string) {
  (res as any).status(status).json({ error: message });
}

function handleAuthError(res: any, err: unknown) {
  if (err instanceof AuthError) {
    errorJson(res, 403, err.message);
  } else {
    errorJson(res, 500, "Internal error");
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMMUNICATION ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/v1/send-message
restRouter.post("/send-message", async (req, res) => {
  try {
    const { to, body, channel = "sms", subject, html, templateId, templateVars, targetGender } = req.body;
    const agentId = resolveAgentId(authInfo(req), req.body.agentId);

    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass agentId in the request body.\n\nExample: { \"agentId\": \"abc123\", \"to\": \"+15551234567\", \"body\": \"Hello!\" }");
    if (!to) return errorJson(res, 400, "Missing required field 'to'. Provide the recipient address: E.164 phone number (e.g. +15551234567) for SMS/WhatsApp, or email address for email channel.\n\nExample: { \"to\": \"+15551234567\", \"body\": \"Hello!\", \"channel\": \"sms\" }");
    if (!body) return errorJson(res, 400, "Missing required field 'body'. Provide the message text to send.\n\nExample: { \"to\": \"+15551234567\", \"body\": \"Hello!\" }");

    const auth = authInfo(req);
    requireAgent(agentId, auth);

    sanitize(body, "body");
    sanitize(to, "to");
    if (html) sanitize(html, "html");

    const db = getProvider("database");
    const orgId = getOrgId(auth);
    requireAgentInOrg(db, agentId, auth);

    // Look up agent
    const rows = db.query<any>(
      "SELECT agent_id, phone_number, email_address, whatsapp_sender_sid, line_channel_id, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];
    if (agent.status !== "active") return errorJson(res, 400, `Agent "${agentId}" is not active`);

    // Rate limit
    const actionType = channel === "email" ? "email" : channel === "whatsapp" ? "whatsapp" : channel === "line" ? "line" : "sms";

    if (isChannelBlocked(agent.blocked_channels, actionType)) return errorJson(res, 403, `Agent "${agentId}" is blocked on ${actionType} channel`);
    checkRateLimits(db, agentId, actionType, channel, to, auth);

    // Compliance
    const compliance = preSendCheck(db, { channel, to, body, html });
    if (!compliance.allowed) return errorJson(res, 403, `Compliance: ${compliance.reason}`);

    // Resolve gender context for response metadata
    const resolvedAgentGender = getAgentGender(db, agentId);
    const resolvedTargetGender = targetGender || "male";
    const genderContext = { agentGender: resolvedAgentGender, targetGender: resolvedTargetGender };

    // Route by channel — no message storage on success, queue dead_letters on failure
    let result: any;

    if (channel === "email") {
      if (!agent.email_address) return errorJson(res, 400, `Agent "${agentId}" has no email address`);
      if (!subject) return errorJson(res, 400, "Subject is required for email channel");
      const email = getProvider("email");
      result = await email.send({ from: agent.email_address, to, subject, body, html });
      logUsage(db, { agentId, actionType: "email", channel: "email", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
      metrics.increment("mcp_messages_sent_total", { channel: "email" });
      maybeTriggerSandboxReply({ orgId, agentId, channel: "email", to, from: agent.email_address, body });
      return res.json({ success: true, externalId: result.messageId, status: result.status, channel: "email", from: agent.email_address, to, genderContext, ...(config.demoMode && { demo: true }) });
    }

    if (channel === "whatsapp") {
      if (!agent.whatsapp_sender_sid) return errorJson(res, 400, `Agent "${agentId}" has no WhatsApp sender`);
      const whatsapp = getProvider("whatsapp");
      result = await whatsapp.send({ from: agent.whatsapp_sender_sid, to, body, templateId, templateVars });
      logUsage(db, { agentId, actionType: "whatsapp", channel: "whatsapp", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
      metrics.increment("mcp_messages_sent_total", { channel: "whatsapp" });
      maybeTriggerSandboxReply({ orgId, agentId, channel: "whatsapp", to, from: agent.whatsapp_sender_sid, body });
      return res.json({ success: true, externalId: result.messageId, status: result.status, channel: "whatsapp", from: agent.whatsapp_sender_sid, to, genderContext, ...(config.demoMode && { demo: true }) });
    }

    if (channel === "line") {
      if (!agent.line_channel_id) return errorJson(res, 400, `Agent "${agentId}" has no LINE channel`);
      const line = getProvider("line");
      result = await line.send({ channelAccessToken: agent.line_channel_id, to, body });
      logUsage(db, { agentId, actionType: "line", channel: "line", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
      metrics.increment("mcp_messages_sent_total", { channel: "line" });
      maybeTriggerSandboxReply({ orgId, agentId, channel: "line", to, from: agentId, body });
      return res.json({ success: true, externalId: result.messageId, status: result.status, channel: "line", from: agentId, to, genderContext, ...(config.demoMode && { demo: true }) });
    }

    // Default: SMS
    const fromNumber = resolveFromNumber(db, agent.phone_number, to, "sms", orgId);
    if (!fromNumber) return errorJson(res, 400, `Agent "${agentId}" has no phone number available`);
    const telephony = getProvider("telephony");
    result = await telephony.sendSms({ from: fromNumber, to, body });
    logUsage(db, { agentId, actionType: "sms", channel: "sms", targetAddress: to, cost: result.cost ?? 0, externalId: result.messageId });
    metrics.increment("mcp_messages_sent_total", { channel: "sms" });
    maybeTriggerSandboxReply({ orgId, agentId, channel: "sms", to, from: fromNumber, body });

    logger.info("rest_send_message", { agentId, to, channel: "sms" });
    return res.json({ success: true, externalId: result.messageId, status: result.status, channel: "sms", from: fromNumber, to, genderContext, ...(config.demoMode && { demo: true }) });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/make-call
restRouter.post("/make-call", async (req, res) => {
  try {
    const { to, systemPrompt, greeting, voice, language, recipientTimezone, targetGender } = req.body;
    const agentId = resolveAgentId(authInfo(req), req.body.agentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass agentId in the request body.\n\nExample: { \"to\": \"+15551234567\" }");
    if (!to) return errorJson(res, 400, "Missing required field 'to'. Provide the recipient phone number in E.164 format.\n\nExample: { \"to\": \"+15551234567\" }");

    const auth = authInfo(req);
    requireAgent(agentId, auth);
    sanitize(to, "to");
    if (systemPrompt) sanitize(systemPrompt, "systemPrompt");
    if (greeting) sanitize(greeting, "greeting");

    const db = getProvider("database");
    const orgId = getOrgId(auth);
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];

    const fromNumber = resolveFromNumber(db, agent.phone_number, to, "voice", orgId);
    if (!fromNumber) return errorJson(res, 400, `Agent "${agentId}" has no phone number available`);
    if (agent.status !== "active") return errorJson(res, 400, `Agent "${agentId}" is not active`);
    if (isChannelBlocked(agent.blocked_channels, "voice")) return errorJson(res, 403, `Agent "${agentId}" is blocked on voice channel`);

    checkRateLimits(db, agentId, "voice_call", "voice", to, auth);

    // TCPA
    if (!config.demoMode) {
      const tz = recipientTimezone || inferTimezoneFromPhone(to);
      const tcpa = checkTcpaTimeOfDay(tz);
      if (!tcpa.allowed) return errorJson(res, 403, `Compliance: ${tcpa.reason}`);
    }

    const dncCheck = checkDnc(db, to, "phone");
    if (!dncCheck.allowed) return errorJson(res, 403, `Compliance: ${dncCheck.reason}`);

    if (greeting) {
      const cc = checkContentFilter(greeting);
      if (!cc.allowed) return errorJson(res, 403, `Compliance: ${cc.reason}`);
    }

    const sessionId = randomUUID();
    const agentLang = getAgentLanguage(db, agentId);
    const callLang = language || agentLang;
    const agentGender = getAgentGender(db, agentId);
    const resolvedTargetGender = targetGender || "male";
    const genderInstructions = buildGenderInstructions({ language: callLang, agentGender, targetGender: resolvedTargetGender });
    storeCallConfig(sessionId, {
      agentId,
      systemPrompt: applyGuardrails(systemPrompt || config.voiceDefaultSystemPrompt) + genderInstructions,
      greeting: applyDisclosure(greeting || config.voiceDefaultGreeting),
      voice: voice || config.voiceDefaultVoice,
      language: callLang,
      agentLanguage: agentLang,
      agentGender,
      targetGender: resolvedTargetGender,
    });

    const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agentId}/outbound-voice?session=${sessionId}`;
    const telephony = getProvider("telephony");

    let result;
    try {
      result = await telephony.makeCall({ from: fromNumber, to, webhookUrl });
    } catch (callErr) {
      const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
      try {
        db.run(
          `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status) VALUES (?, ?, ?, 'voice', 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
          [randomUUID(), agentId, orgId, fromNumber, to, systemPrompt || null, JSON.stringify({ to, systemPrompt, greeting, voice, language, targetGender }), errMsg],
        );
      } catch {}
      return errorJson(res, 500, errMsg);
    }

    try {
      db.run(
        `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, org_id) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
        [randomUUID(), agentId, result.callSid, fromNumber, to, result.status, orgId],
      );
    } catch { /* best effort */ }

    logUsage(db, { agentId, actionType: "voice_call", channel: "voice", targetAddress: to, cost: 0, externalId: result.callSid });

    logger.info("rest_make_call", { agentId, to, callSid: result.callSid });
    return res.json({ success: true, callSid: result.callSid, sessionId, status: result.status, from: fromNumber, to });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/call-on-behalf
restRouter.post("/call-on-behalf", async (req, res) => {
  try {
    const { target, targetName, requesterPhone, requesterName, message, recipientTimezone, targetGender } = req.body;
    const agentId = resolveAgentId(authInfo(req), req.body.agentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass agentId in the request body.");
    if (!target) return errorJson(res, 400, "Missing required field 'target'. Provide the phone number of the person to call (E.164 format, e.g. +15551234567).");
    if (!requesterPhone) return errorJson(res, 400, "Missing required field 'requesterPhone'. Provide your phone number where the call will be bridged to (E.164 format, e.g. +15559876543).");

    const auth = authInfo(req);
    requireAgent(agentId, auth);
    sanitize(target, "target");
    sanitize(requesterPhone, "requesterPhone");
    if (targetName) sanitize(targetName, "targetName");
    if (requesterName) sanitize(requesterName, "requesterName");
    if (message) sanitize(message, "message");

    const db = getProvider("database");
    const orgId = getOrgId(auth);
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];

    const fromNumber = resolveFromNumber(db, agent.phone_number, target, "voice", orgId);
    if (!fromNumber) return errorJson(res, 400, `Agent "${agentId}" has no phone number available`);
    if (agent.status !== "active") return errorJson(res, 400, `Agent "${agentId}" is not active`);
    if (isChannelBlocked(agent.blocked_channels, "voice")) return errorJson(res, 403, `Agent "${agentId}" is blocked on voice channel`);

    checkRateLimits(db, agentId, "voice_call", "voice", target, auth);

    // TCPA
    if (!config.demoMode) {
      const tz = recipientTimezone || inferTimezoneFromPhone(target);
      const tcpa = checkTcpaTimeOfDay(tz);
      if (!tcpa.allowed) return errorJson(res, 403, `Compliance: ${tcpa.reason}`);
    }

    const dncCheck = checkDnc(db, target, "phone");
    if (!dncCheck.allowed) return errorJson(res, 403, `Compliance: ${dncCheck.reason}`);

    // Build secretary prompt
    const callerName = requesterName || "your contact";
    const calleeName = targetName || "";
    const messageContext = message ? `\nContext: ${callerName} wants to talk about: ${message}` : "";
    const systemPrompt = `You are a phone secretary calling on behalf of ${callerName}.
${callerName} would like to speak with ${calleeName || "the person"}.${messageContext}

Your job:
1. Greet them and ask if now is a good time to talk.
2. If YES — say "Great, please hold while I connect you" and use the transfer_call tool to transfer to ${requesterPhone}.
3. If NO — ask when would be a better time, note their answer, thank them and say goodbye.

Keep it natural and brief — this is a phone call.`;
    const msgPart = message ? ` ${message}.` : "";
    const rawGreeting = `Hi${calleeName ? ` ${calleeName}` : ""}, I'm calling on behalf of ${callerName}.${msgPart} Is this a good time to talk?`;
    const greeting = applyDisclosure(rawGreeting);

    const sessionId = randomUUID();
    const agentLang = getAgentLanguage(db, agentId);
    const agentGender = getAgentGender(db, agentId);
    const resolvedTargetGender = targetGender || "male";
    const genderInstructions = buildGenderInstructions({ language: agentLang, agentGender, targetGender: resolvedTargetGender });
    storeCallConfig(sessionId, {
      agentId,
      systemPrompt: applyGuardrails(systemPrompt) + genderInstructions,
      greeting,
      voice: config.voiceDefaultVoice,
      language: agentLang,
      agentLanguage: agentLang,
      agentGender,
      targetGender: resolvedTargetGender,
      forceMode: "answering-machine",
    });

    const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agentId}/outbound-voice?session=${sessionId}`;
    const telephony = getProvider("telephony");

    let result;
    try {
      result = await telephony.makeCall({ from: fromNumber, to: target, webhookUrl });
    } catch (callErr) {
      const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
      try {
        db.run(
          `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status) VALUES (?, ?, ?, 'voice', 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
          [randomUUID(), agentId, orgId, fromNumber, target, `[Call On Behalf] ${callerName} → ${calleeName || target}`, JSON.stringify({ target, targetName, requesterPhone, requesterName, message, targetGender }), errMsg],
        );
      } catch {}
      return errorJson(res, 500, errMsg);
    }

    try {
      db.run(
        `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, org_id) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
        [randomUUID(), agentId, result.callSid, fromNumber, target, result.status, orgId],
      );
    } catch { /* best effort */ }

    logUsage(db, { agentId, actionType: "voice_call", channel: "voice", targetAddress: target, cost: 0, externalId: result.callSid });

    logger.info("rest_call_on_behalf", { agentId, target, targetName, requesterPhone, requesterName, callSid: result.callSid });
    return res.json({
      success: true, callSid: result.callSid, sessionId, status: result.status,
      from: fromNumber, to: target,
      description: `Calling ${calleeName || target} on behalf of ${callerName}. If available, will be connected to ${requesterPhone}.`,
    });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/send-voice-message
restRouter.post("/send-voice-message", async (req, res) => {
  try {
    const { to, text, voice } = req.body;
    const agentId = resolveAgentId(authInfo(req), req.body.agentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass agentId in the request body.");
    if (!to) return errorJson(res, 400, "Missing required field 'to'. Provide the recipient phone number in E.164 format (e.g. +15551234567).");
    if (!text) return errorJson(res, 400, "Missing required field 'text'. Provide the text to convert to speech.\n\nExample: { \"to\": \"+15551234567\", \"text\": \"Hi, this is a voice message from your doctor.\" }");

    const auth = authInfo(req);
    requireAgent(agentId, auth);
    sanitize(text, "text");
    sanitize(to, "to");

    const db = getProvider("database");
    const orgId = getOrgId(auth);
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, phone_number, status, blocked_channels FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];

    const fromNumber = resolveFromNumber(db, agent.phone_number, to, "voice", orgId);
    if (!fromNumber) return errorJson(res, 400, `Agent "${agentId}" has no phone number available`);
    if (agent.status !== "active") return errorJson(res, 400, `Agent "${agentId}" is not active`);
    if (isChannelBlocked(agent.blocked_channels, "voice")) return errorJson(res, 403, `Agent "${agentId}" is blocked on voice channel`);

    checkRateLimits(db, agentId, "voice_message", "voice", to, auth);

    // TTS
    const tts = getProvider("tts");
    const ttsResult = await tts.synthesize({ text, voice, outputFormat: "ulaw_8000" });

    // Upload
    const storage = getProvider("storage");
    const audioKey = `voice-${randomUUID()}.wav`;
    const audioUrl = await storage.upload(audioKey, ttsResult.audioBuffer, "audio/wav");

    // Call
    const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
    const telephony = getProvider("telephony");

    let callResult;
    try {
      callResult = await telephony.makeCall({ from: fromNumber, to, twiml });
    } catch (callErr) {
      const errMsg = callErr instanceof Error ? callErr.message : String(callErr);
      try {
        db.run(
          `INSERT INTO dead_letters (id, agent_id, org_id, channel, direction, reason, from_address, to_address, body, original_request, error_details, status) VALUES (?, ?, ?, 'voice', 'outbound', 'send_failed', ?, ?, ?, ?, ?, 'pending')`,
          [randomUUID(), agentId, orgId, fromNumber, to, text, JSON.stringify({ to, text, voice }), errMsg],
        );
      } catch {}
      return errorJson(res, 500, errMsg);
    }

    logUsage(db, { agentId, actionType: "voice_message", channel: "voice", targetAddress: to, cost: 0, externalId: callResult.callSid });

    logger.info("rest_send_voice_message", { agentId, to, callSid: callResult.callSid });
    return res.json({ success: true, callSid: callResult.callSid, status: callResult.status, from: fromNumber, to, audioUrl, durationSeconds: ttsResult.durationSeconds });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/transfer-call
restRouter.post("/transfer-call", async (req, res) => {
  try {
    const { callSid, to, announcementText } = req.body;
    const agentId = resolveAgentId(authInfo(req), req.body.agentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass agentId in the request body.");
    if (!callSid) return errorJson(res, 400, "Missing required field 'callSid'. Provide the Twilio Call SID of the active call to transfer (starts with CA...).");
    if (!to) return errorJson(res, 400, "Missing required field 'to'. Provide the transfer target: E.164 phone number (e.g. +15551234567) or another agent's ID.");

    const auth = authInfo(req);
    requireAgent(agentId, auth);
    sanitize(callSid, "callSid");
    sanitize(to, "to");
    if (announcementText) sanitize(announcementText, "announcementText");

    const db = getProvider("database");
    const orgId = getOrgId(auth);
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);

    checkRateLimits(db, agentId, "voice_call", "voice", to, auth);

    // Resolve target
    let targetNumber = to;
    if (!to.startsWith("+")) {
      const targetRows = db.query<any>(
        "SELECT agent_id, phone_number, status FROM agent_channels WHERE agent_id = ? AND status = 'active'",
        [to],
      );
      if (targetRows.length > 0 && targetRows[0].phone_number) {
        targetNumber = targetRows[0].phone_number;
      } else {
        return errorJson(res, 404, `Target agent "${to}" not found or has no phone number`);
      }
    }

    const telephony = getProvider("telephony");
    await telephony.transferCall({ callSid, to: targetNumber, announcementText });

    const logId = randomUUID();
    db.run(
      `INSERT INTO call_logs (id, agent_id, call_sid, direction, from_address, to_address, status, transfer_to, org_id) VALUES (?, ?, ?, 'transfer', ?, ?, 'transferred', ?, ?)`,
      [logId, agentId, callSid, rows[0].phone_number || agentId, targetNumber, targetNumber, orgId],
    );
    logUsage(db, { agentId, actionType: "voice_transfer", channel: "voice", targetAddress: targetNumber, cost: 0, externalId: callSid });

    logger.info("rest_transfer_call", { logId, agentId, callSid, to: targetNumber });
    return res.json({ success: true, logId, callSid, transferredTo: targetNumber, status: "transferred" });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// GET /api/v1/waiting-messages
restRouter.get("/waiting-messages", async (req, res) => {
  try {
    const agentId = resolveAgentId(authInfo(req), req.query.agentId as string);
    const limit = parseInt(req.query.limit as string) || 50;
    const channel = req.query.channel as string | undefined;

    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass ?agentId=<id> as a query parameter.\n\nExample: GET /api/v1/waiting-messages?agentId=my-agent&limit=50");

    const auth = authInfo(req);
    requireAgent(agentId, auth);

    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    let sql = "SELECT * FROM dead_letters WHERE agent_id = ? AND status = 'pending'";
    const params: unknown[] = [agentId];

    if (channel) {
      sql += " AND channel = ?";
      params.push(channel);
    }

    sql += " ORDER BY created_at ASC LIMIT ?";
    params.push(limit);

    const rows = db.query<any>(sql, params);

    // Auto-acknowledge fetched messages
    const ids = rows.map((r: any) => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE dead_letters SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id IN (${placeholders})`,
        ids,
      );
    }

    const messages = rows.map((r: any) => ({
      id: r.id,
      agentId: r.agent_id,
      channel: r.channel,
      direction: r.direction,
      reason: r.reason,
      from: r.from_address,
      to: r.to_address,
      body: r.body,
      mediaUrl: r.media_url,
      errorDetails: r.error_details,
      externalId: r.external_id,
      createdAt: r.created_at,
    }));

    return res.json({ messages, count: messages.length });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AGENT MANAGEMENT ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/v1/provision
restRouter.post("/provision", async (req, res) => {
  try {
    const { agentId: explicitAgentId, displayName, greeting, systemPrompt, country = "US", capabilities: rawCaps, emailDomain } = req.body;
    if (!displayName) return errorJson(res, 400, "Missing required field 'displayName'. Provide a human-readable name for the agent.\n\nExample: { \"displayName\": \"Support Bot\", \"capabilities\": { \"phone\": true, \"voiceAi\": true } }");
    if (!rawCaps) return errorJson(res, 400, "Missing required field 'capabilities'. Specify which channels to enable.\n\nObject format: { \"phone\": true, \"voiceAi\": true, \"email\": true, \"whatsapp\": true }\nArray format: [\"sms\", \"voice\", \"email\", \"whatsapp\"]");
    const agentId = explicitAgentId || randomUUID();

    // Normalize capabilities: accept array ['sms','voice'] or object {phone,voiceAi}
    const caps = Array.isArray(rawCaps)
      ? {
          phone: rawCaps.includes("sms") || rawCaps.includes("phone"),
          voiceAi: rawCaps.includes("voice") || rawCaps.includes("voiceAi"),
          email: rawCaps.includes("email"),
          whatsapp: rawCaps.includes("whatsapp"),
        }
      : rawCaps;

    const auth = authInfo(req);
    requireAdmin(auth);
    const orgId = getOrgId(auth);

    if (config.identityMode !== "dedicated" || config.isolationMode !== "single-account") {
      return errorJson(res, 400, `Provisioning requires identityMode="dedicated" and isolationMode="single-account"`);
    }

    const db = getProvider("database");

    const existing = db.query<any>("SELECT agent_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (existing.length > 0) return errorJson(res, 409, `Agent "${agentId}" already exists`);

    const poolRows = db.query<any>("SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'");
    const pool = poolRows[0];
    if (!pool) return errorJson(res, 500, "Agent pool not initialized");
    if (pool.active_agents >= pool.max_agents) return errorJson(res, 400, `Agent pool is full (${pool.active_agents}/${pool.max_agents})`);

    let boughtNumber: { phoneNumber: string; sid: string } | null = null;
    let assignedWhatsApp = false;
    let agentInserted = false;
    let phoneNumber: string | null = null;
    let whatsappSenderSid: string | null = null;
    let whatsappNumber: string | null = null;
    let emailAddress: string | null = null;
    let whatsappStatus = "inactive";

    try {
      if (caps.phone || caps.voiceAi) {
        boughtNumber = await searchAndBuyNumber(country, { voice: true, sms: true });
        phoneNumber = boughtNumber.phoneNumber;
        await configureNumberWebhooks(phoneNumber, agentId, config.webhookBaseUrl);
      }

      if (caps.email) {
        emailAddress = generateEmailAddress(agentId, emailDomain || config.emailDefaultDomain);
      }

      const channelId = randomUUID();
      db.run(
        `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, system_prompt, greeting, status, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [channelId, agentId, displayName, phoneNumber, null, whatsappStatus, emailAddress, caps.voiceAi ? "default" : null, systemPrompt || null, greeting || null, orgId],
      );
      agentInserted = true;

      if (caps.whatsapp) {
        const waResult = assignFromPool(db, agentId);
        if (waResult) {
          assignedWhatsApp = true;
          whatsappNumber = waResult.phoneNumber;
          whatsappSenderSid = waResult.senderSid || waResult.phoneNumber;
          whatsappStatus = "active";
          db.run("UPDATE agent_channels SET whatsapp_sender_sid = ?, whatsapp_status = ? WHERE agent_id = ?", [whatsappSenderSid, whatsappStatus, agentId]);
        } else {
          whatsappStatus = "unavailable";
          db.run("UPDATE agent_channels SET whatsapp_status = ? WHERE agent_id = ?", [whatsappStatus, agentId]);
        }
      }

      db.run("UPDATE agent_pool SET active_agents = active_agents + 1, updated_at = datetime('now') WHERE id = 'default'");
      const updatedPool = db.query<any>("SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'");
      const slotsRemaining = updatedPool[0] ? updatedPool[0].max_agents - updatedPool[0].active_agents : 0;

      const { plainToken, tokenHash } = generateToken();
      storeToken(db, agentId, tokenHash, `provisioned-${displayName}`, orgId);

      db.run(`INSERT OR IGNORE INTO spending_limits (id, agent_id, org_id) VALUES (?, ?, ?)`, [randomUUID(), agentId, orgId]);

      appendAuditLog(db, { eventType: "agent_provisioned", actor: "admin", target: agentId, details: { displayName, phoneNumber, emailAddress, whatsappStatus } });
      logger.info("rest_provision", { agentId, displayName });

      return res.json({
        success: true, agentId, displayName, securityToken: plainToken,
        channels: {
          phone: phoneNumber ? { number: phoneNumber, status: "active" } : null,
          whatsapp: caps.whatsapp ? { number: whatsappNumber, senderSid: whatsappSenderSid, status: whatsappStatus } : null,
          email: emailAddress ? { address: emailAddress, status: "active" } : null,
          voiceAi: caps.voiceAi ? { status: "active", usesPhoneNumber: phoneNumber } : null,
        },
        pool: { slotsRemaining },
        ...(config.demoMode && { demo: true }),
      });
    } catch (err) {
      if (boughtNumber) try { await releasePhoneNumber(boughtNumber.phoneNumber); } catch {}
      if (assignedWhatsApp) try { returnToPool(db, agentId); } catch {}
      try { revokeAgentTokens(db, agentId); } catch {}
      try { db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]); } catch {}
      if (agentInserted) try { db.run("DELETE FROM agent_channels WHERE agent_id = ?", [agentId]); } catch {}
      throw err;
    }
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/deprovision
restRouter.post("/deprovision", async (req, res) => {
  try {
    const { agentId: explicitAgentId, releaseNumber = true } = req.body;
    const auth = authInfo(req);
    requireAdmin(auth);
    const agentId = resolveAgentId(auth, explicitAgentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. Pass it in the request body: { \"agentId\": \"<agent-id>\" }. If using an agent API key, it is auto-detected.\n\nExample: { \"agentId\": \"abc123\", \"releaseNumber\": true }");

    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, phone_number, whatsapp_sender_sid, status FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];
    if (agent.status === "deprovisioned") return errorJson(res, 400, `Agent "${agentId}" is already deprovisioned`);

    const warnings: string[] = [];

    if (releaseNumber && agent.phone_number) {
      try { await releasePhoneNumber(agent.phone_number); } catch (e) {
        warnings.push(`Failed to release phone number: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (agent.whatsapp_sender_sid) returnToPool(db, agentId);
    revokeAgentTokens(db, agentId);
    db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]);
    db.run("UPDATE agent_channels SET status = 'deprovisioned', updated_at = datetime('now') WHERE agent_id = ?", [agentId]);
    db.run("UPDATE agent_pool SET active_agents = MAX(0, active_agents - 1), updated_at = datetime('now') WHERE id = 'default'");

    appendAuditLog(db, { eventType: "agent_deprovisioned", actor: "admin", target: agentId, details: { numberReleased: releaseNumber && !!agent.phone_number, whatsappReturned: !!agent.whatsapp_sender_sid } });
    logger.info("rest_deprovision", { agentId });

    return res.json({
      success: true, agentId, status: "deprovisioned",
      numberReleased: releaseNumber && !!agent.phone_number,
      whatsappReturned: !!agent.whatsapp_sender_sid,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// GET /api/v1/agents/:agentId/tokens
restRouter.get("/agents/:agentId/tokens", async (req, res) => {
  try {
    const auth = authInfo(req);
    requireAdmin(auth);

    const agentId = String(req.params.agentId);
    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT id, label, created_at, last_used_at FROM agent_tokens WHERE agent_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
      [agentId],
    );
    return res.json({ tokens: rows.map((r: any) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at })) });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/agents/:agentId/regenerate-token
restRouter.post("/agents/:agentId/regenerate-token", async (req, res) => {
  try {
    const auth = authInfo(req);
    requireAdmin(auth);

    const agentId = String(req.params.agentId);
    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    // Verify agent exists
    const rows = db.query<any>("SELECT agent_id, org_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const orgId = rows[0].org_id || "default";

    // Revoke all existing tokens
    const revoked = revokeAgentTokens(db, agentId);

    // Generate and store new token
    const { plainToken, tokenHash } = generateToken();
    storeToken(db, agentId, tokenHash, `regenerated`, orgId);

    appendAuditLog(db, { eventType: "token_regenerated", actor: "admin", target: agentId, details: { revokedCount: revoked } });
    logger.info("token_regenerated", { agentId, revokedCount: revoked });

    return res.json({ success: true, token: plainToken, revokedCount: revoked });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// GET /api/v1/channel-status
restRouter.get("/channel-status", async (req, res) => {
  try {
    const agentId = resolveAgentId(authInfo(req), req.query.agentId as string);
    if (!agentId) return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass ?agentId=<id> as a query parameter.\n\nExample: GET /api/v1/channel-status?agentId=my-agent");

    const auth = authInfo(req);
    requireAgent(agentId, auth);

    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    const rows = db.query<any>(
      "SELECT agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, status, provisioned_at FROM agent_channels WHERE agent_id = ?",
      [agentId],
    );
    if (rows.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);
    const agent = rows[0];

    const smsCnt = db.query<any>("SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'sms'", [agentId])[0]?.cnt ?? 0;
    const emailCnt = db.query<any>("SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'email'", [agentId])[0]?.cnt ?? 0;
    const waCnt = db.query<any>("SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND channel = 'whatsapp'", [agentId])[0]?.cnt ?? 0;

    const poolRows = db.query<any>("SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'");
    const pool = poolRows[0] || { max_agents: 0, active_agents: 0 };

    return res.json({
      agentId, displayName: agent.display_name, status: agent.status, provisionedAt: agent.provisioned_at,
      channels: {
        phone: agent.phone_number ? { number: agent.phone_number, status: agent.status, messageCount: smsCnt } : null,
        whatsapp: agent.whatsapp_sender_sid ? { senderSid: agent.whatsapp_sender_sid, status: agent.whatsapp_status, messageCount: waCnt } : null,
        email: agent.email_address ? { address: agent.email_address, status: agent.status, messageCount: emailCnt } : null,
        voiceAi: agent.voice_id ? { voiceId: agent.voice_id, status: agent.status } : null,
      },
      pool: { maxAgents: pool.max_agents, activeAgents: pool.active_agents, slotsRemaining: pool.max_agents - pool.active_agents },
    });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/onboard
restRouter.post("/onboard", async (req, res) => {
  try {
    const { agentId: explicitAgentId, displayName, capabilities = { phone: true, whatsapp: true, email: true, voiceAi: true }, emailDomain, greeting, systemPrompt, country = "US" } = req.body;
    if (!displayName) return errorJson(res, 400, "Missing required field 'displayName' — a human-readable name for the agent.\n\nExample: { \"displayName\": \"Support Bot\", \"capabilities\": { \"phone\": true, \"email\": true } }");
    const agentId = explicitAgentId || randomUUID();

    const auth = authInfo(req);
    requireAdmin(auth);
    const orgId = getOrgId(auth);

    if (config.identityMode !== "dedicated" || config.isolationMode !== "single-account") {
      return errorJson(res, 400, `Onboarding requires identityMode="dedicated" and isolationMode="single-account"`);
    }

    const db = getProvider("database");

    const existing = db.query<any>("SELECT agent_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (existing.length > 0) return errorJson(res, 409, `Agent "${agentId}" already exists`);

    const poolRows = db.query<any>("SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'");
    const pool = poolRows[0];
    if (!pool) return errorJson(res, 500, "Agent pool not initialized");
    if (pool.active_agents >= pool.max_agents) return errorJson(res, 400, `Agent pool is full (${pool.active_agents}/${pool.max_agents})`);

    let boughtNumber: { phoneNumber: string; sid: string } | null = null;
    let assignedWhatsApp = false;
    let agentInserted = false;
    let phoneNumber: string | null = null;
    let whatsappSenderSid: string | null = null;
    let whatsappNumber: string | null = null;
    let emailAddress: string | null = null;
    let whatsappStatus = "inactive";

    try {
      if (capabilities.phone || capabilities.voiceAi) {
        boughtNumber = await searchAndBuyNumber(country, { voice: true, sms: true });
        phoneNumber = boughtNumber.phoneNumber;
        await configureNumberWebhooks(phoneNumber, agentId, config.webhookBaseUrl);
      }

      const domain = emailDomain || config.emailDefaultDomain;
      if (capabilities.email) emailAddress = generateEmailAddress(agentId, domain);

      const channelId = randomUUID();
      db.run(
        `INSERT INTO agent_channels (id, agent_id, display_name, phone_number, whatsapp_sender_sid, whatsapp_status, email_address, voice_id, system_prompt, greeting, status, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [channelId, agentId, displayName, phoneNumber, null, whatsappStatus, emailAddress, capabilities.voiceAi ? "default" : null, systemPrompt || null, greeting || null, orgId],
      );
      agentInserted = true;

      if (capabilities.whatsapp) {
        const waResult = assignFromPool(db, agentId);
        if (waResult) {
          assignedWhatsApp = true;
          whatsappNumber = waResult.phoneNumber;
          whatsappSenderSid = waResult.senderSid || waResult.phoneNumber;
          whatsappStatus = "active";
          db.run("UPDATE agent_channels SET whatsapp_sender_sid = ?, whatsapp_status = ? WHERE agent_id = ?", [whatsappSenderSid, whatsappStatus, agentId]);
        } else {
          whatsappStatus = "unavailable";
          db.run("UPDATE agent_channels SET whatsapp_status = ? WHERE agent_id = ?", [whatsappStatus, agentId]);
        }
      }

      db.run("UPDATE agent_pool SET active_agents = active_agents + 1, updated_at = datetime('now') WHERE id = 'default'");
      const updatedPool = db.query<any>("SELECT max_agents, active_agents FROM agent_pool WHERE id = 'default'");
      const slotsRemaining = updatedPool[0] ? updatedPool[0].max_agents - updatedPool[0].active_agents : 0;

      const { plainToken, tokenHash } = generateToken();
      storeToken(db, agentId, tokenHash, `onboarded-${displayName}`, orgId);
      db.run(`INSERT OR IGNORE INTO spending_limits (id, agent_id, org_id) VALUES (?, ?, ?)`, [randomUUID(), agentId, orgId]);

      let emailSetup: any = null;
      if (capabilities.email) {
        try {
          const dnsResult = await requestDomainVerification(domain);
          emailSetup = { domain, records: dnsResult.records };
        } catch {
          emailSetup = { domain, records: [] };
        }
      }

      appendAuditLog(db, { eventType: "customer_onboarded", actor: "admin", target: agentId, details: { displayName, phoneNumber, emailAddress, whatsappStatus } });
      logger.info("rest_onboard", { agentId, displayName });

      const baseUrl = config.webhookBaseUrl;
      return res.json({
        success: true,
        provisioning: {
          agentId, displayName, securityToken: plainToken,
          channels: {
            phone: phoneNumber ? { number: phoneNumber, status: "active" } : null,
            whatsapp: capabilities.whatsapp ? { number: whatsappNumber, senderSid: whatsappSenderSid, status: whatsappStatus } : null,
            email: emailAddress ? { address: emailAddress, status: "active" } : null,
            voiceAi: capabilities.voiceAi ? { status: "active", usesPhoneNumber: phoneNumber } : null,
          },
          pool: { slotsRemaining },
        },
        emailSetup,
        webhookUrls: {
          sms: phoneNumber ? `${baseUrl}/webhooks/${agentId}/sms` : null,
          whatsapp: capabilities.whatsapp ? `${baseUrl}/webhooks/${agentId}/whatsapp` : null,
          email: capabilities.email ? `${baseUrl}/webhooks/${agentId}/email` : null,
          voice: capabilities.voiceAi ? `${baseUrl}/webhooks/${agentId}/voice` : null,
        },
        connectionInstructions: {
          sseEndpoint: `${baseUrl}/sse?token=${plainToken}`,
          restApiBase: `${baseUrl}/api/v1`,
          authHeader: `Bearer ${plainToken}`,
        },
      });
    } catch (err) {
      if (boughtNumber) try { await releasePhoneNumber(boughtNumber.phoneNumber); } catch {}
      if (assignedWhatsApp) try { returnToPool(db, agentId); } catch {}
      try { revokeAgentTokens(db, agentId); } catch {}
      try { db.run("DELETE FROM spending_limits WHERE agent_id = ?", [agentId]); } catch {}
      if (agentInserted) try { db.run("DELETE FROM agent_channels WHERE agent_id = ?", [agentId]); } catch {}
      throw err;
    }
  } catch (err) {
    return handleRestError(res, err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BILLING & USAGE ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// GET /api/v1/usage
restRouter.get("/usage", async (req, res) => {
  try {
    const agentId = resolveAgentId(authInfo(req), req.query.agentId as string) || undefined;
    const period = (req.query.period as string) || "today";

    const auth = authInfo(req);
    const isAdmin = config.demoMode || auth?.scopes?.includes("admin");

    if (agentId) {
      requireAgent(agentId, auth);
    } else if (!isAdmin) {
      return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass ?agentId=<id> as a query parameter. Admins can omit agentId to see all agents.\n\nExample: GET /api/v1/usage?period=today  or  GET /api/v1/usage?agentId=my-agent&period=week\n\nValid periods: today, week, month, all");
    }

    const db = getProvider("database");

    let timeFilter: string;
    switch (period) {
      case "today": timeFilter = "created_at >= date('now')"; break;
      case "week": timeFilter = "created_at >= date('now', '-7 days')"; break;
      case "month": timeFilter = "created_at >= date('now', 'start of month')"; break;
      default: timeFilter = "1=1"; break;
    }

    if (agentId) {
      return res.json(buildAgentDashboard(db, agentId, timeFilter, period));
    }

    // Admin: all agents
    const org = orgFilter(auth);
    let agentQuery = "SELECT DISTINCT agent_id FROM agent_channels WHERE status = 'active'";
    const agentParams: unknown[] = [];
    if (org.clause) {
      agentQuery += ` AND ${org.clause}`;
      agentParams.push(...org.params);
    }
    const agents = db.query<any>(agentQuery, agentParams);
    const dashboards = agents.map((a: any) => buildAgentDashboard(db, a.agent_id, timeFilter, period));

    return res.json({ period, agents: dashboards });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// GET /api/v1/billing
restRouter.get("/billing", async (req, res) => {
  try {
    const agentId = resolveAgentId(authInfo(req), req.query.agentId as string) || undefined;
    const period = (req.query.period as string) || "month";

    const auth = authInfo(req);
    const isAdmin = config.demoMode || auth?.scopes?.includes("admin");

    if (agentId) {
      requireAgent(agentId, auth);
    } else if (!isAdmin) {
      return errorJson(res, 400, "Missing agentId. It is auto-detected from your API key. If using an admin/org token, pass ?agentId=<id> as a query parameter. Admins can omit agentId to see all agents.\n\nExample: GET /api/v1/billing?period=month  or  GET /api/v1/billing?agentId=my-agent\n\nValid periods: today, week, month, all");
    }

    const db = getProvider("database");

    let timeFilter: string;
    switch (period) {
      case "today": timeFilter = "created_at >= date('now')"; break;
      case "week": timeFilter = "created_at >= date('now', '-7 days')"; break;
      case "month": timeFilter = "created_at >= date('now', 'start of month')"; break;
      default: timeFilter = "1=1"; break;
    }

    if (agentId) {
      const summary = getBillingSummary(db, agentId, timeFilter);
      const billingConfig = getAgentBillingConfig(db, agentId);
      return res.json({ agentId, period, ...summary, billingConfig });
    }

    // Admin: all agents
    const org = orgFilter(auth);
    let agentQuery = "SELECT DISTINCT agent_id FROM agent_channels WHERE status = 'active'";
    const agentParams: unknown[] = [];
    if (org.clause) {
      agentQuery += ` AND ${org.clause}`;
      agentParams.push(...org.params);
    }
    const agents = db.query<any>(agentQuery, agentParams);
    const summaries = agents.map((a: any) => ({ agentId: a.agent_id, ...getBillingSummary(db, a.agent_id, timeFilter) }));
    const totalProvider = summaries.reduce((s: number, a: any) => s + a.providerCost, 0);
    const totalBilling = summaries.reduce((s: number, a: any) => s + a.billingCost, 0);

    return res.json({
      period, globalMarkupPercent: config.billingMarkupPercent,
      totals: {
        providerCost: Math.round(totalProvider * 10000) / 10000,
        billingCost: Math.round(totalBilling * 10000) / 10000,
        revenue: Math.round((totalBilling - totalProvider) * 10000) / 10000,
      },
      agents: summaries,
    });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/billing/config
restRouter.post("/billing/config", async (req, res) => {
  try {
    const { agentId: explicitAgentId, tier, markupPercent, billingEmail } = req.body;
    const auth = authInfo(req);
    requireAdmin(auth);
    const agentId = resolveAgentId(auth, explicitAgentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. Pass it in the request body: { \"agentId\": \"<agent-id>\" }. If using an agent API key, it is auto-detected.\n\nExample: { \"agentId\": \"abc123\", \"tier\": \"starter\" }");

    const db = getProvider("database");
    const agents = db.query<any>("SELECT agent_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (agents.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);

    setAgentBillingConfig(db, agentId, { tier, markupPercent, billingEmail });
    const updated = getAgentBillingConfig(db, agentId);
    const tierLimits = getTierLimits(updated.tier);

    return res.json({ success: true, agentId, billingConfig: updated, tierLimits, availableTiers: getAvailableTiers() });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// POST /api/v1/agent-limits
restRouter.post("/agent-limits", async (req, res) => {
  try {
    const { agentId: explicitAgentId, limits } = req.body;
    if (!limits) return errorJson(res, 400, "Missing required field 'limits'. Provide an object with rate limit values.\n\nExample: { \"limits\": { \"maxActionsPerMinute\": 10, \"maxActionsPerHour\": 100, \"maxActionsPerDay\": 500, \"maxSpendPerDay\": 10, \"maxSpendPerMonth\": 100 } }");

    const auth = authInfo(req);
    requireAdmin(auth);
    const agentId = resolveAgentId(auth, explicitAgentId);
    if (!agentId) return errorJson(res, 400, "Missing agentId. Pass it in the request body: { \"agentId\": \"<agent-id>\", \"limits\": {...} }. If using an agent API key, it is auto-detected.");

    const db = getProvider("database");
    requireAgentInOrg(db, agentId, auth);

    const agents = db.query<any>("SELECT agent_id FROM agent_channels WHERE agent_id = ?", [agentId]);
    if (agents.length === 0) return errorJson(res, 404, `Agent "${agentId}" not found`);

    const existing = db.query<any>("SELECT * FROM spending_limits WHERE agent_id = ?", [agentId]);

    if (existing.length === 0) {
      db.run(
        `INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), agentId, limits.maxActionsPerMinute ?? 10, limits.maxActionsPerHour ?? 100, limits.maxActionsPerDay ?? 500, limits.maxSpendPerDay ?? 10, limits.maxSpendPerMonth ?? 100],
      );
    } else {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (limits.maxActionsPerMinute !== undefined) { sets.push("max_actions_per_minute = ?"); params.push(limits.maxActionsPerMinute); }
      if (limits.maxActionsPerHour !== undefined) { sets.push("max_actions_per_hour = ?"); params.push(limits.maxActionsPerHour); }
      if (limits.maxActionsPerDay !== undefined) { sets.push("max_actions_per_day = ?"); params.push(limits.maxActionsPerDay); }
      if (limits.maxSpendPerDay !== undefined) { sets.push("max_spend_per_day = ?"); params.push(limits.maxSpendPerDay); }
      if (limits.maxSpendPerMonth !== undefined) { sets.push("max_spend_per_month = ?"); params.push(limits.maxSpendPerMonth); }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        params.push(agentId);
        db.run(`UPDATE spending_limits SET ${sets.join(", ")} WHERE agent_id = ?`, params);
      }
    }

    const current = getAgentLimits(db, agentId);
    logger.info("rest_agent_limits_updated", { agentId, limits });
    return res.json({ success: true, agentId, currentLimits: current });
  } catch (err) {
    return handleRestError(res, err);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function inferTimezoneFromPhone(phone: string): string {
  if (phone.startsWith("+972")) return "Asia/Jerusalem";
  if (phone.startsWith("+852")) return "Asia/Hong_Kong";
  if (phone.startsWith("+86")) return "Asia/Shanghai";
  if (phone.startsWith("+81")) return "Asia/Tokyo";
  if (phone.startsWith("+44")) return "Europe/London";
  if (phone.startsWith("+49")) return "Europe/Berlin";
  if (phone.startsWith("+33")) return "Europe/Paris";
  if (phone.startsWith("+61")) return "Australia/Sydney";
  if (phone.startsWith("+91")) return "Asia/Kolkata";
  return "America/New_York";
}

function buildAgentDashboard(db: ReturnType<typeof getProvider<"database">>, agentId: string, timeFilter: string, period: string) {
  const actionCounts = db.query<{ action_type: string; cnt: number }>(
    `SELECT action_type, COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND ${timeFilter} GROUP BY action_type`,
    [agentId],
  );
  const costs = db.query<{ channel: string; total_cost: number }>(
    `SELECT channel, COALESCE(SUM(cost), 0) as total_cost FROM usage_logs WHERE agent_id = ? AND ${timeFilter} GROUP BY channel`,
    [agentId],
  );
  const totalActions = actionCounts.reduce((s, r) => s + r.cnt, 0);
  const totalCost = costs.reduce((s, r) => s + r.total_cost, 0);
  const limits = getAgentLimits(db, agentId);

  const todayActions = db.query<{ cnt: number }>("SELECT COUNT(*) as cnt FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')", [agentId])[0]?.cnt ?? 0;
  const todaySpend = db.query<{ total: number | null }>("SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now')", [agentId])[0]?.total ?? 0;
  const monthSpend = db.query<{ total: number | null }>("SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE agent_id = ? AND created_at >= date('now', 'start of month')", [agentId])[0]?.total ?? 0;

  return {
    agentId, period,
    actions: Object.fromEntries(actionCounts.map(r => [r.action_type, r.cnt])),
    totalActions,
    costsByChannel: Object.fromEntries(costs.map(r => [r.channel, Math.round(r.total_cost * 10000) / 10000])),
    totalCost: Math.round(totalCost * 10000) / 10000,
    currentUsage: {
      actionsToday: todayActions,
      actionsLimit: limits.maxActionsPerDay,
      spendToday: Math.round(todaySpend * 10000) / 10000,
      spendDayLimit: limits.maxSpendPerDay,
      spendMonth: Math.round((monthSpend ?? 0) * 10000) / 10000,
      spendMonthLimit: limits.maxSpendPerMonth,
    },
    limits,
  };
}

function handleRestError(res: any, err: unknown) {
  if (err instanceof AuthError) return errorJson(res, 403, `Auth error: ${err.message}. Check your Authorization header: Bearer <your-api-key>`);
  if (err instanceof SanitizationError) return errorJson(res, 400, `Invalid input: ${err.message}`);
  if (err instanceof RateLimitError) return errorJson(res, 429, `Rate limit exceeded: ${err.message}. Wait before retrying or request higher limits via POST /api/v1/agent-limits.`);
  const message = err instanceof Error ? err.message : String(err);
  logger.error("rest_api_error", { error: message });
  return errorJson(res, 500, `Server error: ${message}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  OPENAPI 3.1 SPEC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateRestOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "VOS Communication Platform — REST API",
      version: "1.0.0",
      description: "REST API for the VOS Communication Platform. Provides SMS, email, WhatsApp, LINE, and voice capabilities. All endpoints require Bearer token authentication.",
    },
    servers: [
      { url: `${config.webhookBaseUrl}/api/v1`, description: "Current server" },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Communication", description: "Send messages and make calls" },
      { name: "Management", description: "Agent provisioning and channel management" },
      { name: "Billing", description: "Usage tracking and billing" },
      { name: "System", description: "Health and metadata" },
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          tags: ["System"],
          responses: { "200": { description: "Server is healthy", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, uptime: { type: "integer" }, version: { type: "string" } } } } } } },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI specification",
          tags: ["System"],
          responses: { "200": { description: "OpenAPI 3.1 spec" } },
        },
      },
      "/send-message": {
        post: {
          summary: "Send a message (SMS, email, WhatsApp, or LINE)",
          tags: ["Communication"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["to", "body"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent token)" },
                    to: { type: "string", description: "Recipient (E.164 phone or email)" },
                    body: { type: "string", description: "Message text" },
                    channel: { type: "string", enum: ["sms", "email", "whatsapp", "line"], default: "sms" },
                    subject: { type: "string", description: "Email subject (required for email)" },
                    html: { type: "string", description: "Optional HTML body for email" },
                    templateId: { type: "string", description: "WhatsApp template SID" },
                    templateVars: { type: "object", additionalProperties: { type: "string" }, description: "Template variables" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Message sent", content: { "application/json": { schema: { $ref: "#/components/schemas/SendMessageResponse" } } } },
            "400": { description: "Bad request" },
            "403": { description: "Auth or compliance error" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/make-call": {
        post: {
          summary: "Initiate an outbound AI voice call",
          tags: ["Communication"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["to"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent token)" },
                    to: { type: "string", description: "E.164 phone number" },
                    systemPrompt: { type: "string" },
                    greeting: { type: "string" },
                    voice: { type: "string" },
                    language: { type: "string" },
                    recipientTimezone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Call initiated", content: { "application/json": { schema: { $ref: "#/components/schemas/MakeCallResponse" } } } },
            "400": { description: "Bad request" },
            "403": { description: "Auth or compliance error" },
          },
        },
      },
      "/call-on-behalf": {
        post: {
          summary: "Secretary call — call someone on your behalf, bridge if available",
          tags: ["Communication"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["target", "requesterPhone"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent token)" },
                    target: { type: "string", description: "Phone number to call (E.164)" },
                    targetName: { type: "string", description: "Name of the person being called" },
                    requesterPhone: { type: "string", description: "Your phone number — where to bridge if they say yes" },
                    requesterName: { type: "string", description: "Your name" },
                    message: { type: "string", description: "Reason for the call — included in the greeting" },
                    recipientTimezone: { type: "string", description: "IANA timezone of the recipient" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Secretary call initiated" },
            "400": { description: "Bad request" },
            "403": { description: "Auth or compliance error" },
          },
        },
      },
      "/send-voice-message": {
        post: {
          summary: "Place a call that plays a TTS voice message",
          tags: ["Communication"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["to", "text"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent token)" },
                    to: { type: "string" },
                    text: { type: "string", description: "Text to convert to speech" },
                    voice: { type: "string", description: "TTS voice ID" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Voice message call initiated" },
            "400": { description: "Bad request" },
          },
        },
      },
      "/transfer-call": {
        post: {
          summary: "Transfer a live call to another number or agent",
          tags: ["Communication"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["callSid", "to"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent token)" },
                    callSid: { type: "string", description: "Twilio Call SID" },
                    to: { type: "string", description: "Target phone (E.164) or agent ID" },
                    announcementText: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Call transferred" },
            "400": { description: "Bad request" },
          },
        },
      },
      "/waiting-messages": {
        get: {
          summary: "Get waiting (undelivered) messages for an agent — auto-acknowledges on fetch",
          tags: ["Communication"],
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" }, description: "Agent ID (optional if using an agent token)" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "channel", in: "query", schema: { type: "string", enum: ["sms", "email", "whatsapp", "voice", "line"] } },
          ],
          responses: {
            "200": { description: "Waiting messages list", content: { "application/json": { schema: { $ref: "#/components/schemas/WaitingMessagesResponse" } } } },
          },
        },
      },
      "/provision": {
        post: {
          summary: "Provision a new agent with channels (admin only)",
          tags: ["Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["displayName", "capabilities"],
                  properties: {
                    agentId: { type: "string" },
                    displayName: { type: "string" },
                    greeting: { type: "string" },
                    systemPrompt: { type: "string" },
                    country: { type: "string", default: "US" },
                    capabilities: {
                      description: "Object format: {phone: true, voiceAi: true} — or array format: [\"sms\", \"voice\", \"email\", \"whatsapp\"]",
                      oneOf: [
                        { type: "object", properties: { phone: { type: "boolean" }, whatsapp: { type: "boolean" }, email: { type: "boolean" }, voiceAi: { type: "boolean" } } },
                        { type: "array", items: { type: "string", enum: ["sms", "phone", "voice", "voiceAi", "email", "whatsapp"] } },
                      ],
                    },
                    emailDomain: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Agent provisioned" }, "409": { description: "Agent already exists" } },
        },
      },
      "/deprovision": {
        post: {
          summary: "Deprovision an agent (admin only)",
          tags: ["Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent API key)" },
                    releaseNumber: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Agent deprovisioned" } },
        },
      },
      "/channel-status": {
        get: {
          summary: "Get channel status for an agent",
          tags: ["Management"],
          parameters: [{ name: "agentId", in: "query", schema: { type: "string" }, description: "Agent ID (optional if using an agent token)" }],
          responses: { "200": { description: "Channel status" } },
        },
      },
      "/agents/{agentId}/tokens": {
        get: {
          summary: "List active tokens for an agent (admin only)",
          tags: ["Management"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Token list" } },
        },
      },
      "/agents/{agentId}/regenerate-token": {
        post: {
          summary: "Revoke all tokens and generate a new one (admin only)",
          tags: ["Management"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "New token generated" } },
        },
      },
      "/onboard": {
        post: {
          summary: "Full customer onboarding (admin only)",
          tags: ["Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["displayName"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional — auto-generated UUID if omitted)" },
                    displayName: { type: "string" },
                    capabilities: { type: "object", properties: { phone: { type: "boolean" }, whatsapp: { type: "boolean" }, email: { type: "boolean" }, voiceAi: { type: "boolean" } } },
                    emailDomain: { type: "string" },
                    greeting: { type: "string" },
                    systemPrompt: { type: "string" },
                    country: { type: "string", default: "US" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Customer onboarded" } },
        },
      },
      "/usage": {
        get: {
          summary: "Get usage statistics",
          tags: ["Billing"],
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" }, description: "Agent ID (optional for admin)" },
            { name: "period", in: "query", schema: { type: "string", enum: ["today", "week", "month", "all"], default: "today" } },
          ],
          responses: { "200": { description: "Usage dashboard" } },
        },
      },
      "/billing": {
        get: {
          summary: "Get billing summary",
          tags: ["Billing"],
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" } },
            { name: "period", in: "query", schema: { type: "string", enum: ["today", "week", "month", "all"], default: "month" } },
          ],
          responses: { "200": { description: "Billing summary" } },
        },
      },
      "/billing/config": {
        post: {
          summary: "Set billing config for an agent (admin only)",
          tags: ["Billing"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent API key)" },
                    tier: { type: "string", enum: ["free", "starter", "pro", "enterprise"] },
                    markupPercent: { type: "number", minimum: 0, maximum: 500 },
                    billingEmail: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Billing config updated" } },
        },
      },
      "/agent-limits": {
        post: {
          summary: "Set rate limits and spending caps (admin only)",
          tags: ["Billing"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["limits"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID (optional if using an agent API key)" },
                    limits: {
                      type: "object",
                      properties: {
                        maxActionsPerMinute: { type: "integer" },
                        maxActionsPerHour: { type: "integer" },
                        maxActionsPerDay: { type: "integer" },
                        maxSpendPerDay: { type: "number" },
                        maxSpendPerMonth: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Limits updated" } },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Use orchestrator token, org token, or agent token",
        },
      },
      schemas: {
        SendMessageResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            externalId: { type: "string" },
            status: { type: "string" },
            channel: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            genderContext: {
              type: "object",
              description: "Gender context for gendered languages (Hebrew, Arabic, French, etc.)",
              properties: {
                agentGender: { type: "string", enum: ["male", "female", "neutral"] },
                targetGender: { type: "string", enum: ["male", "female", "neutral"] },
              },
            },
            demo: { type: "boolean", description: "Present and true when server is in demo mode" },
          },
        },
        MakeCallResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            callSid: { type: "string" },
            sessionId: { type: "string" },
            status: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
          },
        },
        WaitingMessagesResponse: {
          type: "object",
          properties: {
            messages: { type: "array", items: { $ref: "#/components/schemas/WaitingMessage" } },
            count: { type: "integer" },
          },
        },
        WaitingMessage: {
          type: "object",
          properties: {
            id: { type: "string" },
            agentId: { type: "string" },
            channel: { type: "string" },
            direction: { type: "string" },
            reason: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            body: { type: "string", nullable: true },
            mediaUrl: { type: "string", nullable: true },
            errorDetails: { type: "string", nullable: true },
            externalId: { type: "string", nullable: true },
            createdAt: { type: "string" },
          },
        },
      },
    },
  };
}
