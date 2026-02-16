/**
 * Simulator Tool Registry — single source of truth for all MCP tool schemas.
 * Used by the simulator UI (playground forms, walkthrough scenarios, chat LLM).
 */

export interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  default?: string;
  enum?: string[];
  description: string;
}

export interface ToolDef {
  name: string;
  description: string;
  category: string;
  parameters: ToolParam[];
  demoValues: Record<string, unknown>;
}

export const TOOL_REGISTRY: ToolDef[] = [
  // ── System ──────────────────────────────────────────────────
  {
    name: "comms_ping",
    description: "Health check — returns server status, pool info, and provider config.",
    category: "System",
    parameters: [
      { name: "message", type: "string", required: false, description: "Optional message to echo back" },
    ],
    demoValues: { message: "hello from simulator" },
  },

  // ── Messaging ───────────────────────────────────────────────
  {
    name: "comms_send_message",
    description: "Send a message (SMS, email, or WhatsApp) from an agent to a recipient.",
    category: "Messaging",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID that owns the sending address" },
      { name: "to", type: "string", required: true, description: "Recipient address (phone or email)" },
      { name: "body", type: "string", required: true, description: "The message text to send" },
      { name: "channel", type: "string", required: false, default: "sms", enum: ["sms", "email", "whatsapp"], description: "Channel to send via" },
      { name: "subject", type: "string", required: false, description: "Email subject line (email only)" },
      { name: "html", type: "string", required: false, description: "Optional HTML body (email only)" },
      { name: "templateId", type: "string", required: false, description: "WhatsApp template SID" },
    ],
    demoValues: { agentId: "agent-001", to: "+15551234567", body: "Hello from the simulator!", channel: "sms" },
  },
  {
    name: "comms_get_messages",
    description: "Retrieve message history for an agent, with optional filters.",
    category: "Messaging",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID to query messages for" },
      { name: "channel", type: "string", required: false, enum: ["sms", "email", "whatsapp"], description: "Filter by channel" },
      { name: "direction", type: "string", required: false, enum: ["inbound", "outbound"], description: "Filter by direction" },
      { name: "limit", type: "number", required: false, default: "20", description: "Max messages to return" },
      { name: "contactAddress", type: "string", required: false, description: "Filter by contact address (conversation threading)" },
    ],
    demoValues: { agentId: "agent-001", limit: 10 },
  },

  // ── Voice ───────────────────────────────────────────────────
  {
    name: "comms_send_voice_message",
    description: "Send a pre-recorded voice message (TTS → call).",
    category: "Voice",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID" },
      { name: "to", type: "string", required: true, description: "Recipient phone number (E.164)" },
      { name: "message", type: "string", required: true, description: "Text to synthesize and play" },
      { name: "voice", type: "string", required: false, description: "Voice ID for TTS" },
    ],
    demoValues: { agentId: "agent-001", to: "+15551234567", message: "This is a test voice message from the simulator." },
  },
  {
    name: "comms_make_call",
    description: "Initiate an outbound AI voice conversation call.",
    category: "Voice",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID" },
      { name: "to", type: "string", required: true, description: "Recipient phone number (E.164)" },
      { name: "systemPrompt", type: "string", required: false, description: "System prompt for the AI conversation" },
      { name: "greeting", type: "string", required: false, description: "Initial greeting text" },
    ],
    demoValues: { agentId: "agent-001", to: "+15551234567", greeting: "Hi! I'm calling from AgentOS." },
  },
  {
    name: "comms_transfer_call",
    description: "Transfer a live call to another number or SIP address.",
    category: "Voice",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID" },
      { name: "callSid", type: "string", required: true, description: "The Twilio Call SID to transfer" },
      { name: "transferTo", type: "string", required: true, description: "Destination number or SIP URI" },
      { name: "announceMessage", type: "string", required: false, description: "Message to play before transferring" },
    ],
    demoValues: { agentId: "agent-001", callSid: "CA1234567890abcdef", transferTo: "+15559876543", announceMessage: "Transferring you now." },
  },

  // ── Verification ────────────────────────────────────────────
  {
    name: "comms_send_otp",
    description: "Send a one-time verification code to a phone number or email.",
    category: "Verification",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID" },
      { name: "to", type: "string", required: true, description: "Recipient phone or email" },
      { name: "channel", type: "string", required: false, default: "sms", enum: ["sms", "email"], description: "Delivery channel" },
    ],
    demoValues: { agentId: "agent-001", to: "+15551234567", channel: "sms" },
  },
  {
    name: "comms_verify_otp",
    description: "Verify a one-time code submitted by the user.",
    category: "Verification",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent ID" },
      { name: "to", type: "string", required: true, description: "The phone or email the code was sent to" },
      { name: "code", type: "string", required: true, description: "The 6-digit code to verify" },
    ],
    demoValues: { agentId: "agent-001", to: "+15551234567", code: "123456" },
  },

  // ── Provisioning ────────────────────────────────────────────
  {
    name: "comms_onboard_customer",
    description: "Full customer onboarding — provisions all channels, returns setup package.",
    category: "Provisioning",
    parameters: [
      { name: "displayName", type: "string", required: true, description: "Customer/agent display name" },
      { name: "email", type: "string", required: false, description: "Contact email" },
      { name: "enableSms", type: "boolean", required: false, default: "true", description: "Enable SMS channel" },
      { name: "enableEmail", type: "boolean", required: false, default: "true", description: "Enable email channel" },
      { name: "enableWhatsapp", type: "boolean", required: false, default: "false", description: "Enable WhatsApp channel" },
      { name: "enableVoice", type: "boolean", required: false, default: "true", description: "Enable voice channel" },
      { name: "systemPrompt", type: "string", required: false, description: "Default system prompt for voice" },
      { name: "greeting", type: "string", required: false, description: "Default voice greeting" },
    ],
    demoValues: { displayName: "Acme Corp", email: "admin@acme.com", enableSms: true, enableEmail: true, enableVoice: true },
  },
  {
    name: "comms_provision_channels",
    description: "Provision communication channels for an existing agent.",
    category: "Provisioning",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to provision for" },
      { name: "channels", type: "string", required: true, enum: ["sms", "email", "whatsapp", "voice"], description: "Comma-separated channels to provision" },
    ],
    demoValues: { agentId: "agent-001", channels: "sms,email" },
  },
  {
    name: "comms_deprovision_channels",
    description: "Release channels and clean up resources for an agent.",
    category: "Provisioning",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to deprovision" },
      { name: "channels", type: "string", required: false, description: "Specific channels to release (omit for all)" },
    ],
    demoValues: { agentId: "agent-001" },
  },
  {
    name: "comms_get_channel_status",
    description: "Get current channel configuration and status for an agent.",
    category: "Provisioning",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to check" },
    ],
    demoValues: { agentId: "agent-001" },
  },
  {
    name: "comms_register_provider",
    description: "Register or verify third-party provider credentials.",
    category: "Provisioning",
    parameters: [
      { name: "provider", type: "string", required: true, enum: ["twilio", "vonage", "resend", "elevenlabs", "openai-tts", "deepgram", "edge-tts", "s3", "r2", "turso"], description: "Provider name" },
      { name: "credentials", type: "object", required: true, description: "Provider-specific credentials object" },
      { name: "verify", type: "boolean", required: false, default: "true", description: "Whether to verify credentials" },
    ],
    demoValues: { provider: "twilio", credentials: { accountSid: "ACtest123", authToken: "test_token" }, verify: false },
  },
  {
    name: "comms_expand_agent_pool",
    description: "Resize the agent pool capacity.",
    category: "Provisioning",
    parameters: [
      { name: "newSize", type: "number", required: true, description: "New maximum pool size" },
    ],
    demoValues: { newSize: 10 },
  },

  // ── Admin / Billing ─────────────────────────────────────────
  {
    name: "comms_get_usage_dashboard",
    description: "Get usage stats and rate limit status for an agent.",
    category: "Admin",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to query" },
    ],
    demoValues: { agentId: "agent-001" },
  },
  {
    name: "comms_set_agent_limits",
    description: "Set rate limits and spending caps for an agent.",
    category: "Admin",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to configure" },
      { name: "maxActionsPerMinute", type: "number", required: false, description: "Max actions per minute" },
      { name: "maxActionsPerHour", type: "number", required: false, description: "Max actions per hour" },
      { name: "maxActionsPerDay", type: "number", required: false, description: "Max actions per day" },
      { name: "maxSpendPerDay", type: "number", required: false, description: "Max daily spend ($)" },
      { name: "maxSpendPerMonth", type: "number", required: false, description: "Max monthly spend ($)" },
    ],
    demoValues: { agentId: "agent-001", maxActionsPerDay: 1000, maxSpendPerDay: 25 },
  },
  {
    name: "comms_set_billing_config",
    description: "Set billing tier, markup, and billing email for an agent.",
    category: "Billing",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to configure" },
      { name: "tier", type: "string", required: false, enum: ["free", "starter", "pro", "enterprise"], description: "Billing tier" },
      { name: "markupPercent", type: "number", required: false, description: "Markup percentage" },
      { name: "billingEmail", type: "string", required: false, description: "Billing contact email" },
    ],
    demoValues: { agentId: "agent-001", tier: "starter", markupPercent: 15, billingEmail: "billing@acme.com" },
  },
  {
    name: "comms_get_billing_summary",
    description: "Get billing breakdown — provider cost vs billed cost.",
    category: "Billing",
    parameters: [
      { name: "agentId", type: "string", required: true, description: "The agent to query" },
      { name: "period", type: "string", required: false, default: "month", enum: ["day", "week", "month"], description: "Billing period" },
    ],
    demoValues: { agentId: "agent-001", period: "month" },
  },
];

/** Get tools grouped by category */
export function getToolCategories(): Record<string, ToolDef[]> {
  const groups: Record<string, ToolDef[]> = {};
  for (const tool of TOOL_REGISTRY) {
    if (!groups[tool.category]) groups[tool.category] = [];
    groups[tool.category].push(tool);
  }
  return groups;
}

/** Convert registry to Anthropic tool_use format */
export function getAnthropicToolDefs(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return TOOL_REGISTRY.map((tool) => {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const p of tool.parameters) {
      const prop: Record<string, unknown> = {
        type: p.type === "object" ? "object" : p.type,
        description: p.description,
      };
      if (p.enum) prop.enum = p.enum;
      if (p.default !== undefined) prop.default = p.default;
      properties[p.name] = prop;
      if (p.required) required.push(p.name);
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  });
}
