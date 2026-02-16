import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getProviderStatus, saveCredentials } from "./env-writer.js";
import { testTwilioCredentials, testElevenLabsCredentials, testResendCredentials } from "./credential-testers.js";
import { renderSetupPage } from "./setup-page.js";
import { renderSwaggerPage } from "./swagger-page.js";
import { renderDashboardPage } from "./dashboard-page.js";
import { renderAdminPage } from "./unified-admin.js";
import { generateOpenApiSpec } from "./openapi-spec.js";
import { runDemoScenarios } from "./scenario-runner.js";
import { handleGetTools, handleExecuteTool, handleChat } from "./simulator-api.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getAgentBillingConfig, setAgentBillingConfig, getTierLimits, getAvailableTiers } from "../lib/billing.js";
import { verifyOrgToken } from "../lib/org-manager.js";
import { orgFilter } from "../security/org-scope.js";
import type { AuthInfo } from "../security/auth-guard.js";

export const adminRouter = Router();

/** Extract AuthInfo from Express request for org-scope helpers. */
function getAuthInfo(req: Request): AuthInfo | undefined {
  if (!req.auth) return undefined;
  return {
    token: req.auth.token,
    clientId: req.auth.clientId,
    scopes: req.auth.scopes,
    orgId: req.auth.orgId,
  };
}

/**
 * Admin auth middleware for POST routes.
 * 3-tier: master token (super-admin) → org token (org-admin) → reject.
 * Agent tokens are NOT allowed on admin routes.
 * No master token configured = allow (graceful degradation for dev).
 */
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // Demo mode = allow with super-admin scope
  if (config.demoMode) {
    req.auth = { token: "demo", clientId: "demo", scopes: ["admin", "super-admin"], orgId: "default" };
    next();
    return;
  }

  // No master token = allow (dev mode / not configured yet)
  if (!config.masterSecurityToken) {
    req.auth = { token: "unconfigured", clientId: "admin", scopes: ["admin", "super-admin"], orgId: "default" };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("admin_auth_failed", { reason: "missing_header", path: req.path });
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <token>" });
    return;
  }

  const token = authHeader.slice(7);

  // 1. Master token → super-admin
  if (token === config.masterSecurityToken) {
    req.auth = { token, clientId: "super-admin", scopes: ["admin", "super-admin"], orgId: undefined };
    next();
    return;
  }

  // 2. Org token → org-admin
  try {
    const db = getProvider("database");
    const orgVerified = verifyOrgToken(db, token);
    if (orgVerified) {
      req.auth = { token, clientId: orgVerified.orgId, scopes: ["org-admin"], orgId: orgVerified.orgId };
      next();
      return;
    }
  } catch {
    // org_tokens table might not exist yet
  }

  logger.warn("admin_auth_failed", { reason: "invalid_token", path: req.path });
  res.status(401).json({ error: "Invalid admin token" });
}

// ── Unified Admin Page ────────────────────────────────────────────
adminRouter.get("/admin", (_req: Request, res: Response) => {
  const spec = generateOpenApiSpec();
  res.type("html").send(renderAdminPage(JSON.stringify(spec)));
});

// ── Redirects from old pages to unified UI ────────────────────────
adminRouter.get("/admin/setup", (_req: Request, res: Response) => {
  res.redirect("/admin#settings");
});

adminRouter.get("/admin/dashboard", (_req: Request, res: Response) => {
  res.redirect("/admin#dashboard");
});

adminRouter.get("/admin/api-docs", (_req: Request, res: Response) => {
  res.redirect("/admin#docs");
});

/** Serve raw OpenAPI spec as JSON */
adminRouter.get("/admin/api-docs/spec.json", (_req: Request, res: Response) => {
  res.json(generateOpenApiSpec());
});

/** Dashboard data API — org-scoped */
adminRouter.get("/admin/api/dashboard", adminAuth, (req: Request, res: Response) => {
  try {
    const db = getProvider("database");
    const authInfo = getAuthInfo(req);
    const of = orgFilter(authInfo);

    // Active agents (org-scoped)
    const agents = db.query<Record<string, unknown>>(
      `SELECT agent_id, display_name, phone_number, email_address, status FROM agent_channels WHERE 1=1${of.clause} ORDER BY provisioned_at DESC LIMIT 50`,
      of.params
    );

    // Usage summary (org-scoped)
    const totalMessages = db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM messages WHERE 1=1${of.clause}`,
      of.params
    );

    let _todayActions = 0;
    try {
      const ta = db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM usage_logs WHERE created_at >= datetime('now', '-1 day')${of.clause}`,
        of.params
      );
      _todayActions = ta[0]?.cnt || 0;
    } catch {}

    let _totalCost = 0;
    try {
      const tc2 = db.query<{ total: number }>(
        `SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE 1=1${of.clause}`,
        of.params
      );
      _totalCost = tc2[0]?.total || 0;
    } catch {}

    // Recent audit log entries as "alerts" (org-scoped)
    let alerts: Array<Record<string, unknown>> = [];
    try {
      alerts = db.query<Record<string, unknown>>(
        `SELECT event_type as severity, action as message, created_at as timestamp FROM audit_log WHERE 1=1${of.clause} ORDER BY created_at DESC LIMIT 10`,
        of.params
      );
    } catch {
      // audit_log might not have data
    }

    res.json({
      agents,
      usage: {
        totalMessages: totalMessages[0]?.cnt || 0,
        todayActions: _todayActions,
        totalCost: _totalCost,
      },
      alerts: alerts.map((a) => ({
        severity: String(a.severity || "INFO").toUpperCase(),
        message: a.message || "System event",
        timestamp: a.timestamp || "",
      })),
    });
  } catch (err) {
    res.json({ agents: [], usage: { totalMessages: 0, todayActions: 0, totalCost: 0 }, alerts: [] });
  }
});

/** Usage history — time-series data for charts (org-scoped) */
adminRouter.get("/admin/api/usage-history", adminAuth, (req: Request, res: Response) => {
  try {
    const db = getProvider("database");
    const of = orgFilter(getAuthInfo(req));

    // Messages by day and channel (last 30 days, org-scoped)
    let messagesByDay: Array<Record<string, unknown>> = [];
    try {
      messagesByDay = db.query<Record<string, unknown>>(
        `SELECT date(created_at) as day, channel, COUNT(*) as count
         FROM messages WHERE created_at >= date('now', '-30 days')${of.clause}
         GROUP BY day, channel ORDER BY day`,
        of.params
      );
    } catch {}

    // Cost by channel (last 30 days, org-scoped)
    let costByChannel: Array<Record<string, unknown>> = [];
    try {
      costByChannel = db.query<Record<string, unknown>>(
        `SELECT channel, COALESCE(SUM(cost), 0) as total_cost, COUNT(*) as count
         FROM usage_logs WHERE created_at >= date('now', '-30 days')${of.clause}
         GROUP BY channel`,
        of.params
      );
    } catch {}

    res.json({ messagesByDay, costByChannel });
  } catch {
    res.json({ messagesByDay: [], costByChannel: [] });
  }
});

/** Voice list from current TTS provider */
adminRouter.get("/admin/api/voices", adminAuth, async (_req: Request, res: Response) => {
  try {
    const tts = getProvider("tts");
    const voices = await tts.listVoices();
    res.json({ voices });
  } catch (err) {
    res.json({ voices: [], error: String(err instanceof Error ? err.message : err) });
  }
});

/** List agents with limits + billing config (org-scoped) */
adminRouter.get("/admin/api/agents", adminAuth, (req: Request, res: Response) => {
  try {
    const db = getProvider("database");
    const of = orgFilter(getAuthInfo(req));

    const agents = db.query<Record<string, unknown>>(
      `SELECT agent_id, display_name, phone_number, email_address, whatsapp_sender_sid, status
       FROM agent_channels WHERE 1=1${of.clause} ORDER BY provisioned_at DESC LIMIT 100`,
      of.params
    );

    const result = agents.map((a) => {
      const agentId = String(a.agent_id);
      const billing = getAgentBillingConfig(db, agentId);

      // Get spending limits
      let limits: Record<string, unknown> = {};
      try {
        const rows = db.query<Record<string, unknown>>(
          "SELECT max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month FROM spending_limits WHERE agent_id = ?",
          [agentId]
        );
        if (rows.length > 0) limits = rows[0];
      } catch {}

      return { ...a, billing, limits };
    });

    res.json({ agents: result, tiers: getAvailableTiers() });
  } catch (err) {
    res.json({ agents: [], tiers: [], error: String(err instanceof Error ? err.message : err) });
  }
});

/** Update agent rate/spending limits */
adminRouter.post("/admin/api/agents/:agentId/limits", adminAuth, (req: Request, res: Response) => {
  try {
    const agentId = String(req.params.agentId);
    const { maxActionsPerMinute, maxActionsPerHour, maxActionsPerDay, maxSpendPerDay, maxSpendPerMonth } = req.body ?? {};
    const db = getProvider("database");

    // Upsert spending_limits
    const existing = db.query<{ agent_id: string }>(
      "SELECT agent_id FROM spending_limits WHERE agent_id = ?",
      [agentId]
    );

    if (existing.length === 0) {
      db.run(
        `INSERT INTO spending_limits (id, agent_id, max_actions_per_minute, max_actions_per_hour, max_actions_per_day, max_spend_per_day, max_spend_per_month)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), agentId, maxActionsPerMinute || 10, maxActionsPerHour || 100, maxActionsPerDay || 500, maxSpendPerDay || 10, maxSpendPerMonth || 100]
      );
    } else {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (maxActionsPerMinute !== undefined) { sets.push("max_actions_per_minute = ?"); params.push(maxActionsPerMinute); }
      if (maxActionsPerHour !== undefined) { sets.push("max_actions_per_hour = ?"); params.push(maxActionsPerHour); }
      if (maxActionsPerDay !== undefined) { sets.push("max_actions_per_day = ?"); params.push(maxActionsPerDay); }
      if (maxSpendPerDay !== undefined) { sets.push("max_spend_per_day = ?"); params.push(maxSpendPerDay); }
      if (maxSpendPerMonth !== undefined) { sets.push("max_spend_per_month = ?"); params.push(maxSpendPerMonth); }
      if (sets.length > 0) {
        params.push(agentId);
        db.run(`UPDATE spending_limits SET ${sets.join(", ")} WHERE agent_id = ?`, params);
      }
    }

    res.json({ success: true, agentId });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err instanceof Error ? err.message : err) });
  }
});

/** Update agent billing tier/markup */
adminRouter.post("/admin/api/agents/:agentId/billing", adminAuth, (req: Request, res: Response) => {
  try {
    const agentId = String(req.params.agentId);
    const { tier, markupPercent, billingEmail } = req.body ?? {};
    const db = getProvider("database");

    setAgentBillingConfig(db, agentId, { tier, markupPercent, billingEmail });
    const updated = getAgentBillingConfig(db, agentId);
    const tierLimits = getTierLimits(updated.tier);

    res.json({ success: true, agentId, billingConfig: updated, tierLimits });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err instanceof Error ? err.message : err) });
  }
});

/** Run demo scenarios */
adminRouter.post("/admin/api/run-scenarios", adminAuth, async (_req: Request, res: Response) => {
  const serverUrl = `http://localhost:${config.port}`;
  const results = await runDemoScenarios(serverUrl);
  res.json({ results, allPassed: results.every((r) => r.passed) });
});

/** Return provider config status (masked values) */
adminRouter.get("/admin/api/status", (_req: Request, res: Response) => {
  const status = getProviderStatus();
  res.json(status);
});

/** Test Twilio credentials */
adminRouter.post("/admin/api/test/twilio", adminAuth, async (req: Request, res: Response) => {
  const { accountSid, authToken } = req.body ?? {};

  if (!accountSid || !authToken) {
    res.status(400).json({ success: false, message: "accountSid and authToken are required" });
    return;
  }

  const result = await testTwilioCredentials(String(accountSid), String(authToken));
  res.json(result);
});

/** Test ElevenLabs credentials */
adminRouter.post("/admin/api/test/elevenlabs", adminAuth, async (req: Request, res: Response) => {
  const { apiKey } = req.body ?? {};

  if (!apiKey) {
    res.status(400).json({ success: false, message: "apiKey is required" });
    return;
  }

  const result = await testElevenLabsCredentials(String(apiKey));
  res.json(result);
});

/** Test Resend credentials */
adminRouter.post("/admin/api/test/resend", adminAuth, async (req: Request, res: Response) => {
  const { apiKey } = req.body ?? {};

  if (!apiKey) {
    res.status(400).json({ success: false, message: "apiKey is required" });
    return;
  }

  const result = await testResendCredentials(String(apiKey));
  res.json(result);
});

/** Save credentials to .env */
adminRouter.post("/admin/api/save", adminAuth, (req: Request, res: Response) => {
  const { credentials } = req.body ?? {};

  if (!credentials || typeof credentials !== "object" || Object.keys(credentials).length === 0) {
    res.status(400).json({ success: false, message: "No credentials provided" });
    return;
  }

  // Only allow known credential keys
  const allowed = new Set([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "EMAIL_DEFAULT_DOMAIN",
    "WEBHOOK_BASE_URL",
    "MASTER_SECURITY_TOKEN",
    "ANTHROPIC_API_KEY",
    "VOICE_DEFAULT_GREETING",
    "VOICE_DEFAULT_VOICE",
    "VOICE_DEFAULT_LANGUAGE",
    "VOICE_DEFAULT_SYSTEM_PROMPT",
    "PROVIDER_TTS",
    "OPENAI_API_KEY",
    "IDENTITY_MODE",
    "ISOLATION_MODE",
  ]);

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (allowed.has(key) && typeof value === "string" && value.length > 0) {
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    res.status(400).json({ success: false, message: "No valid credentials provided" });
    return;
  }

  try {
    saveCredentials(filtered);
    res.json({ success: true, message: `Saved ${Object.keys(filtered).length} credential(s)` });
  } catch (err) {
    res.status(500).json({ success: false, message: `Failed to save: ${String(err)}` });
  }
});

// ── Simulator API ─────────────────────────────────────────────
adminRouter.get("/admin/api/simulator/tools", adminAuth, handleGetTools);
adminRouter.post("/admin/api/simulator/execute", adminAuth, handleExecuteTool);
adminRouter.post("/admin/api/simulator/chat", adminAuth, handleChat);

/** Deploy — restart the server so new .env values take effect */
adminRouter.post("/admin/api/deploy", adminAuth, (_req: Request, res: Response) => {
  res.json({ success: true, message: "Restarting server..." });

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.unref();
    process.exit(0);
  }, 500);
});
