/**
 * OTP MCP tools — comms_send_otp + comms_verify_otp.
 * Agents can send a verification code to a contact, then verify it.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { requireAgent, getOrgId, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { requireAgentInOrg } from "../security/org-scope.js";
import { generateOtp, verifyOtp } from "../security/otp.js";

export function registerOtpTools(server: McpServer): void {
  // ── Send OTP ──────────────────────────────────────────────────────
  server.tool(
    "comms_send_otp",
    "Send a one-time verification code to a contact via SMS, email, or WhatsApp. The code expires in 5 minutes.",
    {
      agentId: z.string().describe("The agent sending the verification"),
      to: z.string().describe("Recipient address (phone E.164 or email)"),
      channel: z.enum(["sms", "email", "whatsapp"]).describe("Delivery channel"),
      purpose: z.string().optional().describe("Optional description like 'account verification'"),
    },
    async ({ agentId, to, channel, purpose }, extra) => {
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      let otp: { code: string; codeId: string; expiresIn: string };
      try {
        otp = generateOtp(db, agentId, to, channel);
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err instanceof Error ? err.message : err) }) }],
          isError: true,
        };
      }

      // Build the message
      const purposeText = purpose ? ` for ${purpose}` : "";
      const messageBody = `Your verification code${purposeText} is: ${otp.code}. It expires in 5 minutes.`;

      // In demo mode, don't actually send — just return the code info
      if (config.demoMode) {
        logger.info("otp_send_demo", { agentId, to: to.slice(0, 4) + "***", channel });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              codeId: otp.codeId,
              expiresIn: otp.expiresIn,
              channel,
              to,
              message: messageBody,
              demoMode: true,
              demoCode: otp.code,
            }, null, 2),
          }],
        };
      }

      // Send via the appropriate channel using the provider
      try {
        if (channel === "sms") {
          const telephony = getProvider("telephony");
          const agentRows = db.query<{ phone_number: string }>(
            "SELECT phone_number FROM agent_channels WHERE agent_id = ? AND status = 'active'",
            [agentId]
          );
          const from = agentRows[0]?.phone_number;
          if (!from) throw new Error("Agent has no phone number configured");
          await telephony.sendSms({ from, to, body: messageBody });
        } else if (channel === "email") {
          const email = getProvider("email");
          const agentRows = db.query<{ email_address: string }>(
            "SELECT email_address FROM agent_channels WHERE agent_id = ? AND status = 'active'",
            [agentId]
          );
          const from = agentRows[0]?.email_address;
          if (!from) throw new Error("Agent has no email configured");
          await email.send({ from, to, subject: "Verification Code", body: messageBody });
        } else if (channel === "whatsapp") {
          const whatsapp = getProvider("whatsapp");
          const agentRows = db.query<{ whatsapp_sender_sid: string }>(
            "SELECT whatsapp_sender_sid FROM agent_channels WHERE agent_id = ? AND status = 'active'",
            [agentId]
          );
          const from = agentRows[0]?.whatsapp_sender_sid;
          if (!from) throw new Error("Agent has no WhatsApp sender configured");
          await whatsapp.send({ from, to, body: messageBody });
        }
      } catch (err) {
        logger.error("otp_send_failed", { agentId, channel, error: String(err) });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Failed to send OTP: ${String(err instanceof Error ? err.message : err)}` }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            codeId: otp.codeId,
            expiresIn: otp.expiresIn,
            channel,
            to,
          }, null, 2),
        }],
      };
    }
  );

  // ── Verify OTP ────────────────────────────────────────────────────
  server.tool(
    "comms_verify_otp",
    "Verify a one-time code provided by a contact. Returns whether the code is valid.",
    {
      agentId: z.string().describe("The agent requesting verification"),
      contactAddress: z.string().describe("The contact's phone or email that received the code"),
      code: z.string().describe("The 6-digit code to verify"),
    },
    async ({ agentId, contactAddress, code }, extra) => {
      try {
        requireAgent(agentId, extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      const authInfo = extra.authInfo as AuthInfo | undefined;
      const orgId = getOrgId(authInfo);
      try { requireAgentInOrg(db, agentId, authInfo); } catch (err) { return authErrorResponse(err); }

      const result = verifyOtp(db, agentId, contactAddress, code);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  logger.info("tool_registered", { name: "comms_send_otp" });
  logger.info("tool_registered", { name: "comms_verify_otp" });
}
