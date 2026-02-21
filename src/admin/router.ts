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
import { verifyOrgToken, generateOrgToken } from "../lib/org-manager.js";
import { orgFilter } from "../security/org-scope.js";
import { getSessionFromCookie, setSessionCookie, COOKIE_MAX_AGE_MS } from "../security/session.js";
import type { AuthInfo } from "../security/auth-guard.js";
import { getDemoDashboard, getDemoUsageHistory, getDemoTopContacts, getDemoAnalytics } from "./demo-data.js";
import { DISCLAIMER_VERSION } from "../public/disclaimer-page.js";

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

  // Session cookie auth — check before Bearer token
  const session = getSessionFromCookie(req);
  if (session) {
    try {
      const db = getProvider("database");
      const orgVerified = verifyOrgToken(db, session.orgToken);
      if (orgVerified) {
        req.auth = { token: session.orgToken, clientId: orgVerified.orgId, scopes: ["org-admin"], orgId: orgVerified.orgId };

        // Check disclaimer acceptance for session-based users
        try {
          const disclaimerRows = db.query<{ version: string }>(
            "SELECT version FROM disclaimer_acceptances WHERE user_id = ? AND disclaimer_type = 'platform_usage' ORDER BY accepted_at DESC LIMIT 1",
            [session.userId],
          );
          if (disclaimerRows.length === 0 || disclaimerRows[0].version !== DISCLAIMER_VERSION) {
            (req as any).disclaimerRequired = true;
          }
        } catch {
          // Table might not exist yet
          (req as any).disclaimerRequired = true;
        }

        next();
        return;
      }
    } catch {
      // Cookie token invalid — fall through to Bearer check
    }
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

// ── Disclaimer gate middleware for admin API endpoints ─────────────
// Disclaimer is now handled as a modal inside the admin page.
// API endpoints still block if disclaimer not accepted (returns JSON hint).
function disclaimerGate(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).disclaimerRequired) {
    res.status(403).json({ requiresDisclaimer: true });
    return;
  }
  next();
}

// ── Unified Admin Page ────────────────────────────────────────────
// Disclaimer is shown as a modal overlay inside the admin page itself.
adminRouter.get("/admin", adminAuth, (req: Request, res: Response) => {
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
adminRouter.get("/admin/api/dashboard", adminAuth, disclaimerGate, (req: Request, res: Response) => {
  if (config.demoMode) { res.json(getDemoDashboard()); return; }
  try {
    const db = getProvider("database");
    const authInfo = getAuthInfo(req);
    const of = orgFilter(authInfo);

    // Active agents (org-scoped)
    const agents = db.query<Record<string, unknown>>(
      `SELECT agent_id, display_name, phone_number, email_address, status FROM agent_channels WHERE 1=1${of.clause} ORDER BY provisioned_at DESC LIMIT 50`,
      of.params
    );

    // Usage summary (org-scoped) — count from usage_logs instead of messages
    const totalMessages = db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM usage_logs WHERE 1=1${of.clause}`,
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

    // Spend today (org-scoped)
    let _spendToday = 0;
    try {
      const st = db.query<{ total: number }>(
        `SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE created_at >= date('now', 'start of day')${of.clause}`,
        of.params
      );
      _spendToday = st[0]?.total || 0;
    } catch {}

    // Spend this month (org-scoped)
    let _spendThisMonth = 0;
    try {
      const sm = db.query<{ total: number }>(
        `SELECT COALESCE(SUM(cost), 0) as total FROM usage_logs WHERE created_at >= date('now', 'start of month')${of.clause}`,
        of.params
      );
      _spendThisMonth = sm[0]?.total || 0;
    } catch {}

    // Call stats (org-scoped)
    let _totalCalls = 0;
    let _todayCalls = 0;
    try {
      const tc = db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM call_logs WHERE 1=1${of.clause}`,
        of.params
      );
      _totalCalls = tc[0]?.cnt || 0;
    } catch {}
    try {
      const tdc = db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM call_logs WHERE created_at >= date('now', 'start of day')${of.clause}`,
        of.params
      );
      _todayCalls = tdc[0]?.cnt || 0;
    } catch {}

    // Pending dead letters (org-scoped)
    let _pendingVoicemails = 0;
    try {
      const pv = db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM dead_letters WHERE status = 'pending'${of.clause}`,
        of.params
      );
      _pendingVoicemails = pv[0]?.cnt || 0;
    } catch {}

    // Delivery rate (30d) for top card — based on usage_logs
    let _deliveryTotal = 0;
    let _deliverySuccess = 0;
    try {
      const dr = db.query<{ total: number; success: number }>(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('sent','delivered','received','completed','queued') THEN 1 ELSE 0 END) as success FROM usage_logs WHERE created_at >= datetime('now', '-30 days')${of.clause}`,
        of.params
      );
      if (dr[0]) { _deliveryTotal = dr[0].total || 0; _deliverySuccess = dr[0].success || 0; }
    } catch {}

    // Aggregated spending limits
    let _limits: { maxActionsDay?: number; maxSpendDay?: number; maxSpendMonth?: number } = {};
    try {
      const lim = db.query<{ mad: number; msd: number; msm: number }>(
        `SELECT MAX(max_actions_per_day) as mad, MAX(max_spend_per_day) as msd, MAX(max_spend_per_month) as msm FROM spending_limits WHERE 1=1${of.clause}`,
        of.params
      );
      if (lim[0]) {
        _limits = {
          maxActionsDay: lim[0].mad || 500,
          maxSpendDay: lim[0].msd || 10,
          maxSpendMonth: lim[0].msm || 100,
        };
      }
    } catch {}

    // Recent activity feed (org-scoped)
    let recentActivity: Array<Record<string, unknown>> = [];
    try {
      recentActivity = db.query<Record<string, unknown>>(
        `SELECT action_type, channel, target_address, status, cost, created_at FROM usage_logs WHERE 1=1${of.clause} ORDER BY created_at DESC LIMIT 15`,
        of.params
      );
    } catch {}

    // Service status — inline provider checks
    const providerStatus = getProviderStatus();
    const services = {
      database: "ok" as string,
      telephony: providerStatus.twilio?.configured ? "ok" : "not_configured",
      email: providerStatus.resend?.configured ? "ok" : "not_configured",
      whatsapp: providerStatus.twilio?.configured ? "ok" : "not_configured",
      voice: (providerStatus.elevenlabs?.configured || providerStatus.voice?.configured) ? "ok" : "not_configured",
      assistant: config.anthropicApiKey ? "ok" : "not_configured",
    };

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
        spendToday: _spendToday,
        spendThisMonth: _spendThisMonth,
        totalCalls: _totalCalls,
        todayCalls: _todayCalls,
        pendingVoicemails: _pendingVoicemails,
        deliveryTotal: _deliveryTotal,
        deliverySuccess: _deliverySuccess,
        limits: {
          maxActionsDay: _limits.maxActionsDay || 500,
          maxSpendDay: _limits.maxSpendDay || 10,
          maxSpendMonth: _limits.maxSpendMonth || 100,
        },
      },
      services,
      recentActivity: recentActivity.map((r) => ({
        actionType: r.action_type || "",
        channel: r.channel || "",
        target: r.target_address || "",
        status: r.status || "",
        cost: r.cost || 0,
        timestamp: r.created_at || "",
      })),
      alerts: alerts.map((a) => ({
        severity: String(a.severity || "INFO").toUpperCase(),
        message: a.message || "System event",
        timestamp: a.timestamp || "",
      })),
    });
  } catch (err) {
    res.json({ agents: [], usage: { totalMessages: 0, todayActions: 0, totalCost: 0, spendToday: 0, spendThisMonth: 0, totalCalls: 0, todayCalls: 0, pendingVoicemails: 0, deliveryTotal: 0, deliverySuccess: 0, limits: { maxActionsDay: 500, maxSpendDay: 10, maxSpendMonth: 100 } }, services: { database: "ok", telephony: "not_configured", email: "not_configured", whatsapp: "not_configured", voice: "not_configured" }, recentActivity: [], alerts: [] });
  }
});

/** My org info — returns the caller's org details for dashboard banners and provisioning limits */
adminRouter.get("/admin/api/my-org", adminAuth, (req: Request, res: Response) => {
  try {
    const authInfo = getAuthInfo(req);
    const isSuperAdmin = req.auth?.scopes?.includes("super-admin");
    const orgId = authInfo?.orgId || "default";

    // In demo mode, return sensible defaults
    if (config.demoMode) {
      res.json({
        role: "super-admin",
        orgId: "default",
        orgName: "Demo Organization",
        mode: "sandbox",
        accountStatus: "approved",
        agentCount: 0,
        poolMax: config.initialAgentPoolSize || 5,
        poolActive: 0,
      });
      return;
    }

    const db = getProvider("database");

    // Determine role
    const role = isSuperAdmin ? "super-admin" : "org-admin";

    // Get org info
    let orgName = "Unknown";
    let mode = "sandbox";
    let accountStatus = "approved";

    try {
      const orgs = db.query<{ name: string; mode: string }>(
        "SELECT name, mode FROM organizations WHERE id = ?",
        [orgId],
      );
      if (orgs.length > 0) {
        orgName = orgs[0].name;
        mode = orgs[0].mode || "sandbox";
      }
    } catch {}

    // Get account status from user_accounts (for org-admins)
    if (!isSuperAdmin) {
      try {
        const users = db.query<{ account_status: string }>(
          "SELECT account_status FROM user_accounts WHERE org_id = ? ORDER BY created_at LIMIT 1",
          [orgId],
        );
        if (users.length > 0) {
          accountStatus = users[0].account_status || "pending_review";
        }
      } catch {}
    }

    // Agent count for this org
    let agentCount = 0;
    try {
      const of = orgFilter(authInfo);
      const cnt = db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM agent_channels WHERE 1=1${of.clause}`,
        of.params,
      );
      agentCount = cnt[0]?.cnt || 0;
    } catch {}

    // Pool info
    const poolMax = config.initialAgentPoolSize || 5;
    let poolActive = agentCount;

    res.json({
      role,
      orgId,
      orgName,
      mode,
      accountStatus,
      agentCount,
      poolMax,
      poolActive,
    });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

/** Usage history — time-series data for charts (org-scoped) */
adminRouter.get("/admin/api/usage-history", adminAuth, (req: Request, res: Response) => {
  if (config.demoMode) { res.json(getDemoUsageHistory()); return; }
  try {
    const db = getProvider("database");
    const of = orgFilter(getAuthInfo(req));

    // Actions by day and channel (last 30 days, org-scoped) — from usage_logs
    let messagesByDay: Array<Record<string, unknown>> = [];
    try {
      messagesByDay = db.query<Record<string, unknown>>(
        `SELECT date(created_at) as day, channel, COUNT(*) as count
         FROM usage_logs WHERE created_at >= date('now', '-30 days')${of.clause}
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

/** Top contacts by activity — org-scoped */
adminRouter.get("/admin/api/top-contacts", adminAuth, (req: Request, res: Response) => {
  if (config.demoMode) { res.json(getDemoTopContacts()); return; }
  try {
    const db = getProvider("database");
    const of = orgFilter(getAuthInfo(req));

    let contacts: Array<Record<string, unknown>> = [];
    try {
      contacts = db.query<Record<string, unknown>>(
        `SELECT target_address, channel, COUNT(*) as action_count, COALESCE(SUM(cost), 0) as total_cost, MAX(created_at) as last_activity
         FROM usage_logs WHERE target_address IS NOT NULL AND target_address != ''${of.clause}
         GROUP BY target_address, channel
         ORDER BY action_count DESC LIMIT 10`,
        of.params
      );
    } catch {}

    res.json({ contacts });
  } catch {
    res.json({ contacts: [] });
  }
});

/** Extended analytics — org-scoped */
adminRouter.get("/admin/api/analytics", adminAuth, (req: Request, res: Response) => {
  if (config.demoMode) { res.json(getDemoAnalytics()); return; }
  try {
    const db = getProvider("database");
    const of = orgFilter(getAuthInfo(req));

    // Delivery rate (30d)
    let deliveryRate: Record<string, unknown> = {};
    try {
      const dr = db.query<{ total: number; success: number; failed: number }>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status IN ('ok','success','delivered','sent') THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status NOT IN ('ok','success','delivered','sent') THEN 1 ELSE 0 END) as failed
         FROM usage_logs WHERE created_at >= date('now', '-30 days')${of.clause}`,
        of.params
      );
      if (dr[0]) deliveryRate = { total: dr[0].total || 0, success: dr[0].success || 0, failed: dr[0].failed || 0 };
    } catch {}

    // Channel distribution (30d)
    let channelDistribution: Array<Record<string, unknown>> = [];
    try {
      channelDistribution = db.query<Record<string, unknown>>(
        `SELECT channel, COUNT(*) as count
         FROM usage_logs WHERE created_at >= date('now', '-30 days')${of.clause}
         GROUP BY channel ORDER BY count DESC`,
        of.params
      );
    } catch {}

    // Peak hours (30d)
    let peakHours: Array<Record<string, unknown>> = [];
    try {
      peakHours = db.query<Record<string, unknown>>(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
         FROM usage_logs WHERE created_at >= date('now', '-30 days')${of.clause}
         GROUP BY hour ORDER BY hour`,
        of.params
      );
    } catch {}

    // Cost trend (14d)
    let costTrend: Array<Record<string, unknown>> = [];
    try {
      costTrend = db.query<Record<string, unknown>>(
        `SELECT date(created_at) as day, COALESCE(SUM(cost), 0) as cost
         FROM usage_logs WHERE created_at >= date('now', '-14 days')${of.clause}
         GROUP BY day ORDER BY day`,
        of.params
      );
    } catch {}

    // Error rate (7d)
    let errorRate: Array<Record<string, unknown>> = [];
    try {
      errorRate = db.query<Record<string, unknown>>(
        `SELECT date(created_at) as day,
                COUNT(*) as total,
                SUM(CASE WHEN status NOT IN ('ok','success','delivered','sent') THEN 1 ELSE 0 END) as errors
         FROM usage_logs WHERE created_at >= date('now', '-7 days')${of.clause}
         GROUP BY day ORDER BY day`,
        of.params
      );
    } catch {}

    res.json({ deliveryRate, channelDistribution, peakHours, costTrend, errorRate });
  } catch {
    res.json({ deliveryRate: {}, channelDistribution: [], peakHours: [], costTrend: [], errorRate: [] });
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
      `SELECT agent_id, display_name, phone_number, email_address, whatsapp_sender_sid, status, language
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

/** Update agent language */
adminRouter.post("/admin/api/agents/:agentId/language", adminAuth, (req: Request, res: Response) => {
  try {
    const agentId = String(req.params.agentId);
    const { language } = req.body ?? {};

    if (!language || typeof language !== "string") {
      res.status(400).json({ success: false, error: "language is required" });
      return;
    }

    const db = getProvider("database");
    db.run("UPDATE agent_channels SET language = ? WHERE agent_id = ?", [language, agentId]);
    res.json({ success: true, agentId, language });
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
    "VOICE_AI_DISCLOSURE",
    "VOICE_AI_DISCLOSURE_TEXT",
    "REQUIRE_EMAIL_VERIFICATION",
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

/** Outbound AI call — admin can trigger an outbound call with a custom persona */
adminRouter.post("/admin/api/outbound-call", adminAuth, async (req: Request, res: Response) => {
  const { to, systemPrompt, greeting, voice, language, agentId } = req.body as Record<string, string>;

  if (!to) {
    res.status(400).json({ error: "Missing 'to' phone number" });
    return;
  }

  const agent = agentId || "test-agent-001";
  const sessionId = randomUUID();

  // Store call config so the WebSocket handler picks up the custom system prompt
  const { storeCallConfig } = await import("../webhooks/voice-sessions.js");
  storeCallConfig(sessionId, {
    agentId: agent,
    systemPrompt: systemPrompt || config.voiceDefaultSystemPrompt,
    greeting: greeting || "Hello",
    voice: voice || config.voiceDefaultVoice || "default",
    language: language || config.voiceDefaultLanguage || "en-US",
  });

  // Build webhook URL
  const webhookUrl = `${config.webhookBaseUrl}/webhooks/${agent}/outbound-voice?session=${sessionId}`;
  const statusUrl = `${config.webhookBaseUrl}/webhooks/${agent}/voice/status`;

  // Place the call via Twilio REST API directly (bypass provider layer to avoid agent auth)
  const twilioSid = config.twilioAccountSid;
  const twilioToken = config.twilioAuthToken;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioToken || !fromNumber) {
    res.status(500).json({ error: "Twilio credentials not configured" });
    return;
  }

  try {
    const params = new URLSearchParams({
      To: to,
      From: fromNumber,
      Url: webhookUrl,
      StatusCallback: statusUrl,
      StatusCallbackEvent: "initiated ringing answered completed",
    });

    const authStr = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authStr}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      logger.error("outbound_call_failed", { status: response.status, error: data });
      res.status(response.status).json({ error: data });
      return;
    }

    logger.info("outbound_call_placed", { callSid: data.sid, to, sessionId });
    res.json({ success: true, callSid: data.sid, sessionId, to, from: fromNumber, webhookUrl });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("outbound_call_error", { error: errMsg });
    res.status(500).json({ error: errMsg });
  }
});

// ── Pending Account Reviews (C9) ────────────────────────────────

/** List pending accounts — super-admin only, SaaS edition only */
adminRouter.get("/admin/api/pending-accounts", adminAuth, (req: Request, res: Response) => {
  try {
    // Non-SaaS editions auto-approve — no pending accounts to review
    if (config.edition !== "saas") {
      res.json({ accounts: [] });
      return;
    }

    const db = getProvider("database");
    const isSuperAdmin = req.auth?.scopes?.includes("super-admin");

    if (!isSuperAdmin) {
      res.status(403).json({ error: "Super-admin access required" });
      return;
    }

    const accounts = db.query<Record<string, unknown>>(
      `SELECT id, email, org_id, company_name, website, use_case_description, account_status, tos_accepted_at, created_at
       FROM user_accounts WHERE account_status = 'pending_review' ORDER BY created_at DESC LIMIT 50`
    );

    res.json({ accounts });
  } catch (err) {
    res.json({ accounts: [], error: String(err instanceof Error ? err.message : err) });
  }
});

/** Approve or reject a pending account */
adminRouter.post("/admin/api/pending-accounts/:userId/review", adminAuth, (req: Request, res: Response) => {
  try {
    const isSuperAdmin = req.auth?.scopes?.includes("super-admin");
    if (!isSuperAdmin) {
      res.status(403).json({ error: "Super-admin access required" });
      return;
    }

    const userId = req.params.userId;
    const { action, reason } = req.body ?? {};

    if (!action || !["approve", "reject", "suspend"].includes(action)) {
      res.status(400).json({ error: "action must be 'approve', 'reject', or 'suspend'" });
      return;
    }

    const db = getProvider("database");
    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      suspend: "suspended",
    };

    const newStatus = statusMap[action];
    const result = db.run(
      "UPDATE user_accounts SET account_status = ? WHERE id = ?",
      [newStatus, userId]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    // If approved, update org mode to production
    if (action === "approve") {
      try {
        const user = db.query<{ org_id: string }>("SELECT org_id FROM user_accounts WHERE id = ?", [userId]);
        if (user.length > 0) {
          db.run("UPDATE organizations SET mode = 'production' WHERE id = ?", [user[0].org_id]);
        }
      } catch {}
    }

    logger.info("account_review", { userId, action: newStatus, reason: reason || null });
    res.json({ success: true, userId, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// ── API Token Endpoints ──────────────────────────────────────────

/** Get the caller's org API token (from session cookie) */
adminRouter.get("/admin/api/my-token", adminAuth, (req: Request, res: Response) => {
  try {
    const session = getSessionFromCookie(req);
    if (session?.orgToken) {
      res.json({ token: session.orgToken });
      return;
    }
    // Fallback: super-admin or Bearer token users don't have a cookie-stored token
    res.json({ token: null, message: "Token available only for session-based login" });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

/** Regenerate org API token — creates new token, updates session cookie */
adminRouter.post("/admin/api/regenerate-token", adminAuth, (req: Request, res: Response) => {
  try {
    const session = getSessionFromCookie(req);
    const orgId = session?.orgId || req.auth?.orgId;

    if (!orgId) {
      res.status(400).json({ error: "Could not determine organization" });
      return;
    }

    const db = getProvider("database");
    const newToken = generateOrgToken(db, orgId, "regenerated");

    // Update session cookie with new token
    if (session) {
      setSessionCookie(res, {
        orgId: session.orgId,
        userId: session.userId,
        orgToken: newToken,
        expiresAt: Date.now() + COOKIE_MAX_AGE_MS,
      });
    }

    logger.info("token_regenerated", { orgId });
    res.json({ success: true, token: newToken });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

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
