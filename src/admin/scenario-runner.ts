/**
 * Scenario test runner — runs 5 end-to-end demo scenarios via MCP.
 * Used from /admin/api-docs to verify all features work in demo mode.
 */

import { logger } from "../lib/logger.js";

export interface ScenarioResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

/**
 * Run all demo scenarios against the running server.
 * Returns results for each scenario.
 */
export async function runDemoScenarios(serverUrl: string): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  // Scenario 1: Health check
  results.push(await runScenario("Health check", async () => {
    const resp = await fetch(`${serverUrl}/health`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    if (data.status !== "ok") throw new Error(`Status: ${data.status}`);
    return `Server healthy, uptime: ${data.uptime}s`;
  }));

  // Scenario 2: Readiness probe
  results.push(await runScenario("Readiness probe", async () => {
    const resp = await fetch(`${serverUrl}/health/ready`);
    const data = await resp.json() as Record<string, unknown>;
    return `Status: ${data.status}, providers: ${JSON.stringify(data.providers)}`;
  }));

  // Scenario 3: Metrics endpoint
  results.push(await runScenario("Prometheus metrics", async () => {
    const resp = await fetch(`${serverUrl}/metrics`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (!text.includes("mcp_")) throw new Error("No MCP metrics found");
    return `Metrics OK (${text.split("\n").length} lines)`;
  }));

  // Scenario 4: Swagger UI loads
  results.push(await runScenario("Swagger UI loads", async () => {
    const resp = await fetch(`${serverUrl}/admin/api-docs`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    if (!html.includes("swagger-ui")) throw new Error("Swagger UI not found in HTML");
    return `Swagger UI page loaded (${html.length} bytes)`;
  }));

  // Scenario 5: OpenAPI spec valid
  results.push(await runScenario("OpenAPI spec valid", async () => {
    const resp = await fetch(`${serverUrl}/admin/api-docs/spec.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const spec = await resp.json() as Record<string, unknown>;
    if (!spec.openapi) throw new Error("Missing openapi field");
    if (!spec.paths) throw new Error("Missing paths");
    const pathCount = Object.keys(spec.paths as Record<string, unknown>).length;
    return `OpenAPI ${spec.openapi}, ${pathCount} paths`;
  }));

  // Scenario 6: Admin dashboard data
  results.push(await runScenario("Dashboard data API", async () => {
    const resp = await fetch(`${serverUrl}/admin/api/dashboard`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    if (!Array.isArray(data.agents)) throw new Error("Missing agents array");
    if (!data.usage) throw new Error("Missing usage section");
    return `Dashboard OK: ${(data.agents as unknown[]).length} agents`;
  }));

  // Scenario 7: Security headers present
  results.push(await runScenario("Security headers", async () => {
    const resp = await fetch(`${serverUrl}/health`);
    const headers = resp.headers;
    const xfo = headers.get("x-frame-options");
    const xcto = headers.get("x-content-type-options");
    if (!xfo) throw new Error("Missing X-Frame-Options");
    if (!xcto) throw new Error("Missing X-Content-Type-Options");
    return `X-Frame-Options: ${xfo}, X-Content-Type-Options: ${xcto}`;
  }));

  // Scenario 8: Admin dashboard page loads
  results.push(await runScenario("Dashboard page loads", async () => {
    const resp = await fetch(`${serverUrl}/admin/dashboard`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    if (!html.includes("Admin Dashboard")) throw new Error("Dashboard title not found");
    return `Dashboard page loaded (${html.length} bytes)`;
  }));

  return results;
}

async function runScenario(name: string, fn: () => Promise<string>): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, passed: true, detail, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("scenario_failed", { name, error: msg });
    return { name, passed: false, detail: msg, durationMs: Date.now() - start };
  }
}
