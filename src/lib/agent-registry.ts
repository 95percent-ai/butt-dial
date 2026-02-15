/**
 * Agent Registry — maps agentId → MCP server session.
 *
 * When an MCP client connects via SSE with an agentId, its server instance
 * is registered here. The voice WebSocket handler uses this to route
 * caller transcripts to the connected agent's LLM via MCP sampling.
 *
 * If no agent session exists for a given agentId, the voice handler
 * falls back to answering-machine mode.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "./logger.js";

export interface AgentSession {
  server: Server;
  sessionId: string;
  connectedAt: Date;
}

const sessions = new Map<string, AgentSession>();

export function registerAgentSession(
  agentId: string,
  session: AgentSession
): void {
  const existing = sessions.get(agentId);
  if (existing) {
    logger.info("agent_registry_replaced", {
      agentId,
      oldSessionId: existing.sessionId,
      newSessionId: session.sessionId,
    });
  }
  sessions.set(agentId, session);
  logger.info("agent_session_registered", {
    agentId,
    sessionId: session.sessionId,
  });
}

export function unregisterAgentSession(agentId: string): void {
  const existed = sessions.delete(agentId);
  if (existed) {
    logger.info("agent_session_unregistered", { agentId });
  }
}

export function getAgentSession(agentId: string): AgentSession | undefined {
  return sessions.get(agentId);
}
