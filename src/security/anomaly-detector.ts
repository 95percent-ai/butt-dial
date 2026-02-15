/**
 * Anomaly detector — runs periodic checks for suspicious patterns.
 * Volume spikes, brute-force auth failures, rapid token rotation.
 * Uses the alert manager for notifications.
 */

import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { sendAlert } from "../observability/alert-manager.js";
import { metrics } from "../observability/metrics.js";

interface DBProvider {
  query: <T>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => { changes: number };
}

// In-memory tracking
const actionWindows: number[] = []; // timestamps of recent actions
const failedAuthByIp = new Map<string, number[]>(); // IP → timestamps
const tokenRotations = new Map<string, number[]>(); // agentId → timestamps

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ROTATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

let detectorInterval: ReturnType<typeof setInterval> | null = null;

/** Record an action for volume tracking. */
export function recordAction(): void {
  actionWindows.push(Date.now());
}

/** Record a failed auth attempt from an IP. */
export function recordFailedAuth(ip: string): void {
  if (!failedAuthByIp.has(ip)) failedAuthByIp.set(ip, []);
  failedAuthByIp.get(ip)!.push(Date.now());
}

/** Record a token generation for an agent. */
export function recordTokenRotation(agentId: string): void {
  if (!tokenRotations.has(agentId)) tokenRotations.set(agentId, []);
  tokenRotations.get(agentId)!.push(Date.now());
}

function pruneOld(arr: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return arr.filter((t) => t > cutoff);
}

async function runChecks(): Promise<void> {
  const now = Date.now();

  // 1. Volume spike: actions in last 5min > 3x previous 5min window
  const cutoff5 = now - WINDOW_MS;
  const cutoff10 = now - 2 * WINDOW_MS;
  const currentActions = actionWindows.filter((t) => t > cutoff5).length;
  const previousActions = actionWindows.filter((t) => t > cutoff10 && t <= cutoff5).length;

  if (previousActions > 0 && currentActions > 3 * previousActions) {
    await sendAlert({
      severity: "MEDIUM",
      title: "Volume spike detected",
      message: `${currentActions} actions in last 5min vs ${previousActions} in previous window (3x threshold)`,
    });
    metrics.increment("mcp_anomaly_detected_total", { type: "volume_spike" });
  }

  // Prune old action entries (keep last 10 minutes)
  const pruneIdx = actionWindows.findIndex((t) => t > cutoff10);
  if (pruneIdx > 0) actionWindows.splice(0, pruneIdx);

  // 2. Brute-force: >10 failed auth attempts per IP in 5min
  for (const [ip, timestamps] of failedAuthByIp) {
    const recent = pruneOld(timestamps, WINDOW_MS);
    failedAuthByIp.set(ip, recent);
    if (recent.length === 0) {
      failedAuthByIp.delete(ip);
      continue;
    }
    if (recent.length > 10) {
      await sendAlert({
        severity: "HIGH",
        title: "Brute-force auth detected",
        message: `${recent.length} failed auth attempts from IP ${ip} in 5 minutes`,
        details: { ip },
      });
      metrics.increment("mcp_anomaly_detected_total", { type: "brute_force" });
    }
  }

  // 3. Rapid token rotation: >3 tokens generated for same agent in 1 hour
  for (const [agentId, timestamps] of tokenRotations) {
    const recent = pruneOld(timestamps, ROTATION_WINDOW_MS);
    tokenRotations.set(agentId, recent);
    if (recent.length === 0) {
      tokenRotations.delete(agentId);
      continue;
    }
    if (recent.length > 3) {
      await sendAlert({
        severity: "MEDIUM",
        title: "Rapid token rotation",
        message: `${recent.length} tokens generated for agent "${agentId}" in 1 hour`,
        details: { agentId },
      });
      metrics.increment("mcp_anomaly_detected_total", { type: "rapid_rotation" });
    }
  }
}

/** Start the anomaly detector (runs every 60 seconds). */
export function startAnomalyDetector(_db: DBProvider): void {
  if (!config.anomalyDetectorEnabled) {
    logger.info("anomaly_detector_disabled");
    return;
  }

  detectorInterval = setInterval(() => {
    runChecks().catch((err) => {
      logger.error("anomaly_detector_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 60_000);

  if (detectorInterval.unref) detectorInterval.unref();
  logger.info("anomaly_detector_started");
}

/** Stop the anomaly detector (for testing). */
export function stopAnomalyDetector(): void {
  if (detectorInterval) {
    clearInterval(detectorInterval);
    detectorInterval = null;
  }
}

/** Reset all tracking state (for testing). */
export function resetAnomalyDetector(): void {
  actionWindows.length = 0;
  failedAuthByIp.clear();
  tokenRotations.clear();
}
