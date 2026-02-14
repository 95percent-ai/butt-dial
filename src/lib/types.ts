export type Channel = "sms" | "whatsapp" | "email" | "voice";
export type Direction = "inbound" | "outbound";
export type ChannelStatus = "active" | "pending_review" | "suspended" | "rejected";
export type MessageStatus = "sent" | "queued" | "delivered" | "failed" | "rate_limited";

export interface AgentChannel {
  id: string;
  agentId: string;
  displayName: string | null;
  phoneNumber: string | null;
  whatsappSenderSid: string | null;
  whatsappStatus: string;
  emailAddress: string | null;
  voiceAppSid: string | null;
  voiceId: string | null;
  systemPrompt: string | null;
  greeting: string | null;
  providerOverrides: Record<string, string> | null;
  routeDuplication: Record<string, unknown> | null;
  status: string;
  provisionedAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  agentId: string;
  channel: Channel;
  direction: Direction;
  fromAddress: string;
  toAddress: string;
  body: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  externalId: string | null;
  status: string;
  cost: number | null;
  createdAt: string;
}

export interface AgentPool {
  id: string;
  maxAgents: number;
  activeAgents: number;
  updatedAt: string;
}
