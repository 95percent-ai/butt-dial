/**
 * Bridge call status webhook — Twilio POSTs here when bridge call legs change state.
 * Updates bridge_calls table with status, outbound SID, duration, and end time.
 */

import type { Request, Response } from "express";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

export function handleBridgeStatus(req: Request, res: Response): void {
  const bridgeCallId = req.query.bridgeCallId as string | undefined;
  const body = req.body as Record<string, string>;

  const callSid = body.CallSid;
  const callStatus = body.CallStatus || body.DialCallStatus;
  const duration = body.CallDuration || body.DialCallDuration;
  const dialCallSid = body.DialCallSid;

  logger.info("bridge_status_received", {
    bridgeCallId,
    callSid,
    callStatus,
    duration,
    dialCallSid,
  });

  if (!bridgeCallId) {
    res.status(200).type("text/xml").send("<Response/>");
    return;
  }

  try {
    const db = getProvider("database");
    const updates: string[] = [];
    const params: unknown[] = [];

    // Map Twilio status to our status
    if (callStatus) {
      const mappedStatus = mapStatus(callStatus);
      updates.push("status = ?");
      params.push(mappedStatus);
    }

    // Track the outbound leg SID
    if (dialCallSid) {
      updates.push("outbound_sid = ?");
      params.push(dialCallSid);
    }

    // Duration
    if (duration) {
      updates.push("duration = ?");
      params.push(parseInt(duration, 10));
    }

    // End time for terminal states
    if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "canceled") {
      updates.push("ended_at = datetime('now')");
    }

    if (updates.length > 0) {
      params.push(bridgeCallId);
      db.run(
        `UPDATE bridge_calls SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }
  } catch (err) {
    logger.error("bridge_status_update_error", {
      bridgeCallId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.status(200).type("text/xml").send("<Response/>");
}

function mapStatus(twilioStatus: string): string {
  switch (twilioStatus) {
    case "initiated":
    case "queued":
      return "pending";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in-progress";
    case "completed":
      return "completed";
    case "busy":
    case "no-answer":
    case "canceled":
    case "failed":
      return "failed";
    default:
      return twilioStatus;
  }
}
