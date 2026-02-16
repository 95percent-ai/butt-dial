/**
 * Organization management MCP tools — super-admin only.
 * comms_create_organization — create a new org + security token
 * comms_list_organizations — list all orgs with agent counts
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";
import { requireSuperAdmin, authErrorResponse, type AuthInfo } from "../security/auth-guard.js";
import { createOrganization, listOrganizations } from "../lib/org-manager.js";

export function registerOrgTools(server: McpServer): void {
  // ── comms_create_organization ──────────────────────────────────
  server.tool(
    "comms_create_organization",
    "Create a new organization with its own isolated data silo. Returns an org admin token. Super-admin only.",
    {
      name: z.string().describe("Organization display name"),
      slug: z.string().regex(/^[a-z0-9-]+$/).describe("URL-safe slug (lowercase, hyphens, no spaces)"),
      settings: z.record(z.unknown()).optional().describe("Optional settings JSON (features, defaults)"),
    },
    async ({ name, slug, settings }, extra) => {
      try {
        requireSuperAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      try {
        const result = createOrganization(db, name, slug, settings);

        logger.info("org_created", { orgId: result.org.id, slug });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              orgId: result.org.id,
              name,
              slug,
              adminToken: result.rawToken,
              message: "Organization created. Save the admin token — it won't be shown again.",
            }, null, 2),
          }],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("org_create_failed", { name, slug, error: errMsg });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }
    }
  );

  // ── comms_list_organizations ──────────────────────────────────
  server.tool(
    "comms_list_organizations",
    "List all organizations with agent counts. Super-admin only.",
    {},
    async (_args, extra) => {
      try {
        requireSuperAdmin(extra.authInfo as AuthInfo | undefined);
      } catch (err) {
        return authErrorResponse(err);
      }

      const db = getProvider("database");

      try {
        const orgs = listOrganizations(db);

        // Enrich with agent counts
        const enriched = orgs.map((org) => {
          const countRows = db.query<{ cnt: number }>(
            "SELECT COUNT(*) as cnt FROM agent_channels WHERE org_id = ?",
            [org.id]
          );
          return {
            ...org,
            agentCount: countRows[0]?.cnt || 0,
          };
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ organizations: enriched, total: enriched.length }, null, 2),
          }],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        };
      }
    }
  );

  logger.info("tool_registered", { name: "comms_create_organization" });
  logger.info("tool_registered", { name: "comms_list_organizations" });
}
