/**
 * Simulator API — Express route handlers for tool execution and LLM chat.
 * Uses InMemoryTransport to create an in-process MCP client that calls
 * the exact same tool code paths as a real MCP connection.
 */

import type { Request, Response } from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { TOOL_REGISTRY, getAnthropicToolDefs, getToolCategories } from "./simulator-tools.js";

// ── Singleton in-memory MCP client ─────────────────────────────
let mcpClient: Client | null = null;
let clientReady = false;

async function getMcpClient(): Promise<Client> {
  if (mcpClient && clientReady) return mcpClient;

  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  mcpClient = new Client({ name: "simulator-client", version: "1.0.0" });

  // Connect both sides
  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  clientReady = true;
  logger.info("simulator_mcp_client_ready", {});
  return mcpClient;
}

// ── GET /admin/api/simulator/tools ─────────────────────────────
export async function handleGetTools(_req: Request, res: Response): Promise<void> {
  try {
    res.json({
      tools: TOOL_REGISTRY,
      categories: getToolCategories(),
      hasLlm: !!config.anthropicApiKey,
      toolCount: TOOL_REGISTRY.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
}

// ── POST /admin/api/simulator/execute ──────────────────────────
export async function handleExecuteTool(req: Request, res: Response): Promise<void> {
  const { tool, args } = req.body ?? {};

  if (!tool || typeof tool !== "string") {
    res.status(400).json({ error: "Missing required field: tool" });
    return;
  }

  // Validate tool exists
  const toolDef = TOOL_REGISTRY.find((t) => t.name === tool);
  if (!toolDef) {
    res.status(400).json({ error: `Unknown tool: ${tool}` });
    return;
  }

  const startTime = Date.now();

  try {
    const client = await getMcpClient();
    const result = await client.callTool({ name: tool, arguments: args || {} });
    const durationMs = Date.now() - startTime;

    // Extract text from result content
    let parsedResult: unknown = result.content;
    if (Array.isArray(result.content) && result.content.length > 0) {
      const first = result.content[0] as { type: string; text?: string };
      if (first.type === "text" && first.text) {
        try {
          parsedResult = JSON.parse(first.text);
        } catch {
          parsedResult = first.text;
        }
      }
    }

    res.json({
      result: parsedResult,
      isError: result.isError || false,
      durationMs,
      tool,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    logger.error("simulator_execute_error", { tool, error: message });
    res.status(500).json({ error: message, isError: true, durationMs, tool });
  }
}

// ── POST /admin/api/simulator/chat ─────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  isError: boolean;
  durationMs: number;
}

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body ?? {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing required field: message" });
    return;
  }

  if (!config.anthropicApiKey) {
    res.status(400).json({ error: "ANTHROPIC_API_KEY not configured. Chat mode requires an LLM." });
    return;
  }

  try {
    // Dynamic import of Anthropic SDK (same pattern as voice-ws.ts)
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    const mcpClientInstance = await getMcpClient();
    const toolDefs = getAnthropicToolDefs();

    // Build messages array from history + new message
    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];
    if (Array.isArray(history)) {
      for (const msg of history as ChatMessage[]) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });

    const toolCalls: ToolCallRecord[] = [];
    const MAX_ITERATIONS = 10;

    const systemPrompt = `You are a helpful assistant demonstrating the Butt-Dial Communication MCP Server.
You have access to ${TOOL_REGISTRY.length} tools covering messaging (SMS, email, WhatsApp), voice calls, OTP verification, provisioning, billing, and system health.
When the user asks you to perform an action, use the appropriate tool. Explain what you're doing and show the results.
The server is running in ${config.demoMode ? "DEMO mode (mock providers, no real messages sent)" : "LIVE mode"}.
Available agent IDs can be found by running comms_ping first. For demo purposes, use "agent-001" as a default agent ID.`;

    // Agentic tool-use loop
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        tools: toolDefs as any,
        messages: messages as any,
      });

      // Check if we got tool_use blocks
      const hasToolUse = response.content.some((b: { type: string }) => b.type === "tool_use");

      if (!hasToolUse) {
        // Final text response — extract and return
        const textBlock = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
        const reply = textBlock?.text || "I completed the operation.";
        res.json({ reply, toolCalls });
        return;
      }

      // Process tool_use blocks
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const toolBlock = block as { id: string; name: string; input: Record<string, unknown> };

        const startTime = Date.now();
        let result: unknown;
        let isError = false;

        try {
          const mcpResult = await mcpClientInstance.callTool({
            name: toolBlock.name,
            arguments: toolBlock.input || {},
          });

          isError = !!mcpResult.isError;

          // Parse the result
          if (Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
            const first = mcpResult.content[0] as { type: string; text?: string };
            if (first.type === "text" && first.text) {
              try {
                result = JSON.parse(first.text);
              } catch {
                result = first.text;
              }
            } else {
              result = mcpResult.content;
            }
          } else {
            result = mcpResult.content;
          }
        } catch (err) {
          isError = true;
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        const durationMs = Date.now() - startTime;
        toolCalls.push({ name: toolBlock.name, args: toolBlock.input, result, isError, durationMs });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults as unknown as string });
    }

    // If we exceeded max iterations, return what we have
    res.json({
      reply: "I reached the maximum number of tool calls. Here are the results so far.",
      toolCalls,
    });
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    logger.error("simulator_chat_error", { error: message2 });
    res.status(500).json({ error: message2 });
  }
}
