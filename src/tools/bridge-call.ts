/**
 * comms_bridge_call — MCP tool for managing call bridges.
 *
 * Lets someone make a cheap local call in Country A, which gets routed
 * over VoIP to Country B as another cheap local call. Two local calls
 * instead of one expensive international call (~85% cost savings).
 *
 * Actions: setup, remove, list, call
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { requireAdmin, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { sanitize, sanitizationErrorResponse } from "../security/sanitizer.js";
import { logUsage } from "../security/rate-limiter.js";
import type { BridgeRoute, BridgeCall } from "../providers/interfaces.js";

function jsonResponse(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function registerBridgeCallTool(server: McpServer): void {
  server.tool(
    "comms_bridge_call",
    "Manage call bridges — route inbound local calls to outbound local numbers via VoIP. Two cheap local calls instead of one expensive international call.",
    {
      action: z.enum(["setup", "remove", "list", "call"]).describe(
        "setup: register a bridge route. remove: delete a route. list: show routes + recent calls. call: initiate a bridge call programmatically."
      ),
      // setup params
      fromNumber: z.string().optional().describe("(setup) Caller ID to match in E.164 format, or '*' for any caller"),
      localNumber: z.string().optional().describe("(setup) Twilio number that receives the inbound call"),
      destinationNumber: z.string().optional().describe("(setup/call) Number to dial on the outbound leg"),
      label: z.string().optional().describe("(setup) Human-readable label for this route"),
      // remove params
      bridgeId: z.string().optional().describe("(remove/call) Bridge route ID"),
      // call params
      callerNumber: z.string().optional().describe("(call) Number to call first (caller leg)"),
    },
    async ({ action, fromNumber, localNumber, destinationNumber, label, bridgeId, callerNumber }, extra) => {
      // Auth: bridge management requires admin access
      try {
        requireAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");
      const orgId = getOrgId(extra.authInfo as AuthInfo | undefined);

      // ---- SETUP ----
      if (action === "setup") {
        if (!fromNumber || !localNumber || !destinationNumber) {
          return jsonResponse({ error: "setup requires fromNumber, localNumber, and destinationNumber" }, true);
        }

        try {
          sanitize(fromNumber, "fromNumber");
          sanitize(localNumber, "localNumber");
          sanitize(destinationNumber, "destinationNumber");
          if (label) sanitize(label, "label");
        } catch (err) {
          return sanitizationErrorResponse(err);
        }

        // Check for duplicate route
        const existing = db.query<BridgeRoute>(
          "SELECT id FROM bridge_registry WHERE local_number = ? AND caller_pattern = ? AND destination_number = ? AND org_id = ?",
          [localNumber, fromNumber, destinationNumber, orgId]
        );
        if (existing.length > 0) {
          return jsonResponse({ error: "A bridge route with these exact parameters already exists", existingId: existing[0].id }, true);
        }

        const id = randomUUID();
        db.run(
          `INSERT INTO bridge_registry (id, local_number, caller_pattern, destination_number, label, org_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, localNumber, fromNumber, destinationNumber, label || null, orgId]
        );

        logger.info("bridge_route_created", { id, localNumber, fromNumber, destinationNumber, label });

        return jsonResponse({
          success: true,
          bridgeId: id,
          localNumber,
          callerPattern: fromNumber,
          destinationNumber,
          label: label || null,
          description: `When ${fromNumber === "*" ? "anyone" : fromNumber} calls ${localNumber}, bridge to ${destinationNumber}`,
        });
      }

      // ---- REMOVE ----
      if (action === "remove") {
        if (!bridgeId) {
          return jsonResponse({ error: "remove requires bridgeId" }, true);
        }

        const existing = db.query<BridgeRoute>(
          "SELECT id FROM bridge_registry WHERE id = ? AND org_id = ?",
          [bridgeId, orgId]
        );
        if (existing.length === 0) {
          return jsonResponse({ error: `Bridge route "${bridgeId}" not found` }, true);
        }

        db.run("DELETE FROM bridge_registry WHERE id = ? AND org_id = ?", [bridgeId, orgId]);

        logger.info("bridge_route_removed", { bridgeId });

        return jsonResponse({ success: true, removed: bridgeId });
      }

      // ---- LIST ----
      if (action === "list") {
        const routes = db.query<BridgeRoute>(
          "SELECT * FROM bridge_registry WHERE org_id = ? ORDER BY created_at DESC",
          [orgId]
        );

        const recentCalls = db.query<BridgeCall>(
          "SELECT * FROM bridge_calls WHERE org_id = ? ORDER BY started_at DESC LIMIT 20",
          [orgId]
        );

        return jsonResponse({
          routes: routes.map(r => ({
            id: r.id,
            localNumber: r.local_number,
            callerPattern: r.caller_pattern,
            destinationNumber: r.destination_number,
            label: r.label,
            active: r.active === 1,
            createdAt: r.created_at,
          })),
          recentCalls: recentCalls.map(c => ({
            id: c.id,
            bridgeId: c.bridge_id,
            caller: c.caller,
            destination: c.destination,
            status: c.status,
            duration: c.duration,
            startedAt: c.started_at,
            endedAt: c.ended_at,
          })),
        });
      }

      // ---- CALL ----
      if (action === "call") {
        if (!callerNumber || !destinationNumber) {
          return jsonResponse({ error: "call requires callerNumber and destinationNumber" }, true);
        }

        try {
          sanitize(callerNumber, "callerNumber");
          sanitize(destinationNumber, "destinationNumber");
        } catch (err) {
          return sanitizationErrorResponse(err);
        }

        // Find a suitable Twilio number to use as the bridge
        // If bridgeId is provided, use that route's local number
        let fromTwilioNumber: string;
        let usedBridgeId: string | null = null;

        if (bridgeId) {
          const route = db.query<BridgeRoute>(
            "SELECT * FROM bridge_registry WHERE id = ? AND active = 1 AND org_id = ?",
            [bridgeId, orgId]
          );
          if (route.length === 0) {
            return jsonResponse({ error: `Bridge route "${bridgeId}" not found or inactive` }, true);
          }
          fromTwilioNumber = route[0].local_number;
          usedBridgeId = bridgeId;
        } else {
          // Look up any available Twilio number from agent_channels
          const numberRows = db.query<{ phone_number: string }>(
            "SELECT DISTINCT phone_number FROM agent_channels WHERE phone_number IS NOT NULL AND org_id = ? LIMIT 1",
            [orgId]
          );
          if (numberRows.length === 0 || !numberRows[0].phone_number) {
            return jsonResponse({ error: "No Twilio phone number available and no bridgeId provided" }, true);
          }
          fromTwilioNumber = numberRows[0].phone_number;
        }

        // Create bridge call log
        const callId = randomUUID();
        db.run(
          `INSERT INTO bridge_calls (id, bridge_id, caller, destination, status, org_id)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
          [callId, usedBridgeId, callerNumber, destinationNumber, orgId]
        );

        // Build TwiML: when caller answers, dial the destination
        const statusCallbackUrl = `${config.webhookBaseUrl}/webhooks/bridge-status?bridgeCallId=${callId}`;
        const dialTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${fromTwilioNumber}" action="${statusCallbackUrl}"><Number statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed">${destinationNumber}</Number></Dial></Response>`;

        // Call the caller first
        const telephony = getProvider("telephony");
        let result;
        try {
          result = await telephony.makeCall({
            from: fromTwilioNumber,
            to: callerNumber,
            twiml: dialTwiml,
            statusCallbackUrl,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          db.run("UPDATE bridge_calls SET status = 'failed' WHERE id = ?", [callId]);
          logger.error("bridge_call_failed", { callId, callerNumber, destinationNumber, error: errMsg });
          return jsonResponse({ error: errMsg }, true);
        }

        // Update with inbound SID
        db.run(
          "UPDATE bridge_calls SET inbound_sid = ?, status = 'ringing' WHERE id = ?",
          [result.callSid, callId]
        );

        logUsage(db, {
          agentId: "bridge",
          actionType: "bridge_call",
          channel: "voice",
          targetAddress: destinationNumber,
          cost: 0,
          externalId: result.callSid,
        });

        logger.info("bridge_call_initiated", {
          callId,
          callerNumber,
          destinationNumber,
          callSid: result.callSid,
        });

        return jsonResponse({
          success: true,
          bridgeCallId: callId,
          callSid: result.callSid,
          caller: callerNumber,
          destination: destinationNumber,
          status: "ringing",
        });
      }

      return jsonResponse({ error: `Unknown action: ${action}` }, true);
    }
  );

  logger.info("tool_registered", { name: "comms_bridge_call" });
}
