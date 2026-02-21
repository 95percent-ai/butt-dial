/**
 * OpenAPI 3.1 specification generator.
 * Generates a complete API spec from the registered MCP tools and HTTP routes.
 */

import { config } from "../lib/config.js";

export function generateOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Butt-Dial Communication MCP Server",
      version: "0.1.0",
      description: "MCP-based communication server for AI agents. Provides SMS, email, WhatsApp, and voice capabilities through a unified tool interface.",
      contact: { name: "Butt-Dial" },
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

      // ── REST API v1 ────────────────────────────────────────────
      "/api/v1/health": {
        get: {
          summary: "Health check",
          tags: ["REST API"],
          responses: { "200": { description: "Server is healthy", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, uptime: { type: "integer" }, version: { type: "string" } } } } } } },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          summary: "REST API OpenAPI specification",
          tags: ["REST API"],
          responses: { "200": { description: "OpenAPI 3.1 spec" } },
        },
      },
      "/api/v1/integration-guide": {
        get: {
          summary: "Integration guide (Markdown)",
          tags: ["REST API"],
          responses: { "200": { description: "Markdown integration guide", content: { "text/markdown": {} } } },
        },
      },
      "/api/v1/send-message": {
        post: {
          summary: "Send a message (SMS, email, WhatsApp, or LINE)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "to", "body"],
                  properties: {
                    agentId: { type: "string", description: "Agent ID that owns the sending address" },
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
            "200": { description: "Message sent", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSendMessageResponse" } } } },
            "400": { description: "Bad request" },
            "403": { description: "Auth or compliance error" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/v1/make-call": {
        post: {
          summary: "Initiate an outbound AI voice call",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "to"],
                  properties: {
                    agentId: { type: "string" },
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
            "200": { description: "Call initiated", content: { "application/json": { schema: { $ref: "#/components/schemas/RestMakeCallResponse" } } } },
            "400": { description: "Bad request" },
            "403": { description: "Auth or compliance error" },
          },
        },
      },
      "/api/v1/call-on-behalf": {
        post: {
          summary: "Secretary call — call someone on your behalf, bridge if available",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
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
      "/api/v1/send-voice-message": {
        post: {
          summary: "Place a call that plays a TTS voice message",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "to", "text"],
                  properties: {
                    agentId: { type: "string" },
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
      "/api/v1/transfer-call": {
        post: {
          summary: "Transfer a live call to another number or agent",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "callSid", "to"],
                  properties: {
                    agentId: { type: "string" },
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
      "/api/v1/messages": {
        get: {
          summary: "List messages for an agent",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "agentId", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "channel", in: "query", schema: { type: "string", enum: ["sms", "email", "whatsapp", "voice", "line"] } },
            { name: "contactAddress", in: "query", schema: { type: "string" }, description: "Filter by contact phone/email" },
          ],
          responses: {
            "200": { description: "Messages list", content: { "application/json": { schema: { $ref: "#/components/schemas/RestMessagesResponse" } } } },
          },
        },
      },
      "/api/v1/provision": {
        post: {
          summary: "Provision a new agent with channels (admin only)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "displayName", "capabilities"],
                  properties: {
                    agentId: { type: "string" },
                    displayName: { type: "string" },
                    greeting: { type: "string" },
                    systemPrompt: { type: "string" },
                    country: { type: "string", default: "US" },
                    capabilities: {
                      type: "object",
                      properties: {
                        phone: { type: "boolean" },
                        whatsapp: { type: "boolean" },
                        email: { type: "boolean" },
                        voiceAi: { type: "boolean" },
                      },
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
      "/api/v1/deprovision": {
        post: {
          summary: "Deprovision an agent (admin only)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId"],
                  properties: {
                    agentId: { type: "string" },
                    releaseNumber: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Agent deprovisioned" } },
        },
      },
      "/api/v1/channel-status": {
        get: {
          summary: "Get channel status for an agent",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "agentId", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Channel status" } },
        },
      },
      "/api/v1/onboard": {
        post: {
          summary: "Full customer onboarding (admin only)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "displayName"],
                  properties: {
                    agentId: { type: "string" },
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
      "/api/v1/usage": {
        get: {
          summary: "Get usage statistics",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" }, description: "Agent ID (optional for admin)" },
            { name: "period", in: "query", schema: { type: "string", enum: ["today", "week", "month", "all"], default: "today" } },
          ],
          responses: { "200": { description: "Usage dashboard" } },
        },
      },
      "/api/v1/billing": {
        get: {
          summary: "Get billing summary",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "agentId", in: "query", schema: { type: "string" } },
            { name: "period", in: "query", schema: { type: "string", enum: ["today", "week", "month", "all"], default: "month" } },
          ],
          responses: { "200": { description: "Billing summary" } },
        },
      },
      "/api/v1/billing/config": {
        post: {
          summary: "Set billing config for an agent (admin only)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId"],
                  properties: {
                    agentId: { type: "string" },
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
      "/api/v1/agent-limits": {
        post: {
          summary: "Set rate limits and spending caps (admin only)",
          tags: ["REST API"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agentId", "limits"],
                  properties: {
                    agentId: { type: "string" },
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
        RestSendMessageResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            messageId: { type: "string" },
            externalId: { type: "string" },
            status: { type: "string" },
            channel: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
          },
        },
        RestMakeCallResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            messageId: { type: "string" },
            callSid: { type: "string" },
            sessionId: { type: "string" },
            status: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
          },
        },
        RestMessagesResponse: {
          type: "object",
          properties: {
            messages: { type: "array", items: { type: "object" } },
            count: { type: "integer" },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Orchestrator security token for admin endpoints",
        },
      },
    },
    tags: [
      { name: "System", description: "Health checks and metrics" },
      { name: "MCP", description: "Model Context Protocol endpoints" },
      { name: "Webhooks", description: "Inbound webhook handlers" },
      { name: "Admin", description: "Admin UI and API" },
      { name: "REST API", description: "REST API v1 — HTTP endpoints for sending messages, making calls, and managing agents" },
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
