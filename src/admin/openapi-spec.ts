/**
 * OpenAPI 3.1 specification generator.
 * Generates a complete API spec from the registered MCP tools and HTTP routes.
 */

import { config } from "../lib/config.js";

export function generateOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "AgentOS Communication MCP Server",
      version: "0.1.0",
      description: "MCP-based communication server for AI agents. Provides SMS, email, WhatsApp, and voice capabilities through a unified tool interface.",
      contact: { name: "AgentOS" },
    },
    servers: [
      { url: config.webhookBaseUrl, description: "Current server" },
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health check (liveness)",
          tags: ["System"],
          responses: {
            "200": {
              description: "Server is healthy",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          summary: "Readiness probe",
          tags: ["System"],
          responses: {
            "200": { description: "All providers ready" },
            "503": { description: "Some providers degraded" },
          },
        },
      },
      "/metrics": {
        get: {
          summary: "Prometheus metrics",
          tags: ["System"],
          responses: {
            "200": { description: "Prometheus text format metrics", content: { "text/plain": {} } },
          },
        },
      },
      "/sse": {
        get: {
          summary: "MCP SSE endpoint",
          tags: ["MCP"],
          description: "Connect an MCP client via Server-Sent Events. Pass ?agentId=X to register an agent session.",
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" }, description: "Agent ID to register for voice routing" },
          ],
          responses: {
            "200": { description: "SSE stream opened" },
          },
        },
      },
      "/webhooks/{agentId}/sms": {
        post: {
          summary: "Inbound SMS webhook",
          tags: ["Webhooks"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "TwiML response" } },
        },
      },
      "/webhooks/{agentId}/email": {
        post: {
          summary: "Inbound email webhook",
          tags: ["Webhooks"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/webhooks/{agentId}/whatsapp": {
        post: {
          summary: "Inbound WhatsApp webhook",
          tags: ["Webhooks"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "TwiML response" } },
        },
      },
      "/webhooks/{agentId}/voice": {
        post: {
          summary: "Inbound voice call webhook",
          tags: ["Webhooks"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ConversationRelay TwiML" } },
        },
      },
      "/webhooks/{agentId}/outbound-voice": {
        post: {
          summary: "Outbound voice call webhook",
          tags: ["Webhooks"],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { type: "string" } },
            { name: "session", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "ConversationRelay TwiML" } },
        },
      },
      "/webhooks/{agentId}/call-status": {
        post: {
          summary: "Call status callback",
          tags: ["Webhooks"],
          parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/admin/setup": {
        get: {
          summary: "Setup wizard UI",
          tags: ["Admin"],
          responses: { "200": { description: "HTML setup page" } },
        },
      },
      "/admin/api-docs": {
        get: {
          summary: "Swagger API documentation",
          tags: ["Admin"],
          responses: { "200": { description: "Swagger UI HTML" } },
        },
      },
      "/admin/api/status": {
        get: {
          summary: "Provider configuration status",
          tags: ["Admin"],
          responses: { "200": { description: "Provider status (masked values)" } },
        },
      },
      "/admin/api/save": {
        post: {
          summary: "Save credentials to .env",
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    credentials: { type: "object", additionalProperties: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Credentials saved" } },
        },
      },
      "/admin/api/deploy": {
        post: {
          summary: "Restart server",
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Server restarting" } },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            uptime: { type: "number" },
            version: { type: "string" },
            environment: { type: "string" },
            demoMode: { type: "boolean" },
          },
        },
        McpToolCall: {
          type: "object",
          description: "MCP tools are called via the SSE/messages protocol, not REST. See the tool descriptions below.",
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Master security token for admin endpoints",
        },
      },
    },
    tags: [
      { name: "System", description: "Health checks and metrics" },
      { name: "MCP", description: "Model Context Protocol endpoints" },
      { name: "Webhooks", description: "Inbound webhook handlers" },
      { name: "Admin", description: "Admin UI and API" },
    ],
    "x-mcp-tools": getMcpToolDocs(),
  };
}

function getMcpToolDocs(): Array<Record<string, unknown>> {
  return [
    {
      name: "comms_ping",
      description: "Health check — returns server status and pool info",
      parameters: { message: { type: "string", optional: true } },
    },
    {
      name: "comms_send_message",
      description: "Send SMS, email, or WhatsApp message",
      parameters: {
        agentId: { type: "string", required: true },
        channel: { type: "string", enum: ["sms", "email", "whatsapp"], required: true },
        to: { type: "string", required: true },
        body: { type: "string", required: true },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "Email HTML body" },
      },
    },
    {
      name: "comms_get_messages",
      description: "List messages for an agent",
      parameters: {
        agentId: { type: "string", required: true },
        channel: { type: "string", optional: true },
        limit: { type: "number", optional: true },
      },
    },
    {
      name: "comms_send_voice_message",
      description: "Send a pre-recorded voice message (TTS to call)",
      parameters: {
        agentId: { type: "string", required: true },
        to: { type: "string", required: true },
        message: { type: "string", required: true },
      },
    },
    {
      name: "comms_make_call",
      description: "Initiate an outbound AI voice call",
      parameters: {
        agentId: { type: "string", required: true },
        to: { type: "string", required: true },
        systemPrompt: { type: "string", optional: true },
        greeting: { type: "string", optional: true },
      },
    },
    {
      name: "comms_transfer_call",
      description: "Transfer a live call to a human or another agent",
      parameters: {
        agentId: { type: "string", required: true },
        callSid: { type: "string", required: true },
        to: { type: "string", required: true },
      },
    },
    {
      name: "comms_provision_channels",
      description: "Provision communication channels for an agent",
      parameters: { agentId: { type: "string", required: true } },
    },
    {
      name: "comms_deprovision_channels",
      description: "Deprovision and clean up agent channels",
      parameters: { agentId: { type: "string", required: true } },
    },
    {
      name: "comms_get_channel_status",
      description: "Get channel status and message counts",
      parameters: { agentId: { type: "string", required: true } },
    },
    {
      name: "comms_onboard_customer",
      description: "Full customer onboarding — provision all channels + return setup instructions",
      parameters: {
        agentId: { type: "string", required: true },
        displayName: { type: "string", required: true },
        capabilities: { type: "object", required: true },
      },
    },
    {
      name: "comms_register_provider",
      description: "Register and verify third-party credentials",
      parameters: {
        provider: { type: "string", enum: ["twilio", "vonage", "resend", "elevenlabs", "openai", "deepgram", "s3", "r2", "turso", "convex"] },
        credentials: { type: "object" },
      },
    },
    {
      name: "comms_set_agent_limits",
      description: "Set rate and spending limits for an agent",
      parameters: { agentId: { type: "string", required: true } },
    },
    {
      name: "comms_get_usage_dashboard",
      description: "Get usage stats, costs, and limits",
      parameters: { agentId: { type: "string", required: true } },
    },
  ];
}
