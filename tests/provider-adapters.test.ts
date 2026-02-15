/**
 * Dry test for Phase 14 — Provider Adapters.
 *
 * Tests:
 * 1. comms_register_provider supports all provider types
 * 2. Vonage adapter can be imported and instantiated
 * 3. S3 adapter can be imported and instantiated
 * 4. R2 adapter can be imported and instantiated
 * 5. Convex DB adapter can be imported
 * 6. Turso DB adapter can be imported
 * 7. OpenAI TTS adapter can be imported
 * 8. Deepgram STT adapter can be imported
 * 9. Mock adapters work in demo mode (regression)
 * 10. Provider swap: mock telephony still works after factory changes
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/provider-adapters.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const SERVER_URL = "http://localhost:3100";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function callToolParsed(result: unknown): Record<string, unknown> {
  const text = ((result as { content: Array<{ type: string; text: string }> }).content)[0]?.text;
  return JSON.parse(text);
}

async function main() {
  console.log("\n=== Phase 14: Provider Adapters dry test ===\n");

  // ------------------------------------------------------------------
  // 1. MCP tool discovery — register-provider supports expanded list
  // ------------------------------------------------------------------
  console.log("Test: MCP tools + register-provider");
  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client({ name: "provider-test", version: "1.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  const registerTool = tools.tools.find((t: { name: string }) => t.name === "comms_register_provider");
  assert(registerTool != null, "comms_register_provider tool exists");

  // Check the schema accepts all provider types
  const schema = (registerTool as Record<string, unknown>)?.inputSchema as Record<string, unknown>;
  const properties = schema?.properties as Record<string, unknown>;
  const providerSchema = properties?.provider as Record<string, unknown>;
  const enumValues = (providerSchema?.enum || []) as string[];

  assert(enumValues.includes("twilio"), "Register supports twilio");
  assert(enumValues.includes("vonage"), "Register supports vonage");
  assert(enumValues.includes("resend"), "Register supports resend");
  assert(enumValues.includes("elevenlabs"), "Register supports elevenlabs");
  assert(enumValues.includes("openai"), "Register supports openai");
  assert(enumValues.includes("deepgram"), "Register supports deepgram");
  assert(enumValues.includes("s3"), "Register supports s3");
  assert(enumValues.includes("r2"), "Register supports r2");
  assert(enumValues.includes("turso"), "Register supports turso");
  assert(enumValues.includes("convex"), "Register supports convex");

  // ------------------------------------------------------------------
  // 2. Vonage adapter imports
  // ------------------------------------------------------------------
  console.log("\nTest: Vonage adapter");
  const { createVonageTelephonyProvider } = await import("../src/providers/telephony-vonage.js");
  assert(typeof createVonageTelephonyProvider === "function", "Vonage adapter exports factory function");

  const vonage = createVonageTelephonyProvider({ apiKey: "test", apiSecret: "test" });
  assert(typeof vonage.sendSms === "function", "Vonage has sendSms");
  assert(typeof vonage.makeCall === "function", "Vonage has makeCall");
  assert(typeof vonage.transferCall === "function", "Vonage has transferCall");
  assert(typeof vonage.buyNumber === "function", "Vonage has buyNumber");

  // ------------------------------------------------------------------
  // 3. S3 adapter
  // ------------------------------------------------------------------
  console.log("\nTest: S3 adapter");
  const { createS3StorageProvider } = await import("../src/providers/storage-s3.js");
  assert(typeof createS3StorageProvider === "function", "S3 adapter exports factory function");

  const s3 = createS3StorageProvider({
    bucket: "test-bucket",
    region: "us-east-1",
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
  });
  assert(typeof s3.upload === "function", "S3 has upload");
  assert(typeof s3.download === "function", "S3 has download");
  assert(typeof s3.delete === "function", "S3 has delete");
  assert(typeof s3.getUrl === "function", "S3 has getUrl");

  const s3Url = s3.getUrl("test/file.mp3");
  assert(s3Url.includes("test/file.mp3"), "S3 getUrl returns valid URL");

  // ------------------------------------------------------------------
  // 4. R2 adapter
  // ------------------------------------------------------------------
  console.log("\nTest: R2 adapter");
  const { createR2StorageProvider } = await import("../src/providers/storage-r2.js");
  assert(typeof createR2StorageProvider === "function", "R2 adapter exports factory function");

  const r2 = createR2StorageProvider({
    accountId: "test-account",
    bucket: "test-bucket",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  });
  assert(typeof r2.upload === "function", "R2 has upload");
  assert(typeof r2.getUrl === "function", "R2 has getUrl");

  // ------------------------------------------------------------------
  // 5. Convex adapter
  // ------------------------------------------------------------------
  console.log("\nTest: Convex adapter");
  const { createConvexProvider } = await import("../src/providers/db-convex.js");
  assert(typeof createConvexProvider === "function", "Convex adapter exports factory function");

  const convex = createConvexProvider({ deploymentUrl: "https://test.convex.cloud", adminKey: "test" });
  assert(typeof convex.query === "function", "Convex has query");
  assert(typeof convex.run === "function", "Convex has run");
  assert(typeof convex.exec === "function", "Convex has exec");
  assert(typeof convex.close === "function", "Convex has close");

  // ------------------------------------------------------------------
  // 6. Turso adapter
  // ------------------------------------------------------------------
  console.log("\nTest: Turso adapter");
  const { createTursoProvider } = await import("../src/providers/db-turso.js");
  assert(typeof createTursoProvider === "function", "Turso adapter exports factory function");

  const turso = createTursoProvider({ databaseUrl: "https://test-db.turso.io", authToken: "test" });
  assert(typeof turso.query === "function", "Turso has query");
  assert(typeof turso.run === "function", "Turso has run");

  // ------------------------------------------------------------------
  // 7. OpenAI TTS adapter
  // ------------------------------------------------------------------
  console.log("\nTest: OpenAI TTS adapter");
  const { createOpenAITTSProvider } = await import("../src/providers/tts-openai.js");
  assert(typeof createOpenAITTSProvider === "function", "OpenAI TTS exports factory function");

  const openaiTts = createOpenAITTSProvider({ apiKey: "test" });
  assert(typeof openaiTts.synthesize === "function", "OpenAI TTS has synthesize");
  const voices = await openaiTts.listVoices();
  assert(voices.length > 0, `OpenAI TTS lists ${voices.length} voices`);

  // ------------------------------------------------------------------
  // 8. Deepgram STT adapter
  // ------------------------------------------------------------------
  console.log("\nTest: Deepgram STT adapter");
  const { createDeepgramSTTProvider } = await import("../src/providers/stt-deepgram.js");
  assert(typeof createDeepgramSTTProvider === "function", "Deepgram STT exports factory function");

  const deepgram = createDeepgramSTTProvider({ apiKey: "test" });
  assert(typeof deepgram.transcribe === "function", "Deepgram has transcribe");

  // ------------------------------------------------------------------
  // 9. Demo mode: mock providers work
  // ------------------------------------------------------------------
  console.log("\nTest: demo mode mock providers (regression)");
  const pingResult = callToolParsed(await client.callTool({ name: "comms_ping", arguments: {} }));
  assert(pingResult.status === "ok", "Server healthy in demo mode");

  // Send SMS through mock provider
  const smsResult = callToolParsed(await client.callTool({
    name: "comms_send_message",
    arguments: {
      agentId: "test-agent-001",
      channel: "sms",
      to: "+15551234567",
      body: "Provider adapter test",
    },
  }));
  assert(smsResult.success === true || smsResult.messageId != null, "SMS works through mock provider");

  // ------------------------------------------------------------------
  // 10. Provider swap: factory still initializes correctly
  // ------------------------------------------------------------------
  console.log("\nTest: factory provider status");
  const providers = (pingResult.providers || {}) as Record<string, string>;
  assert(typeof providers.telephony === "string", "Telephony provider reported");
  assert(typeof providers.database === "string", "Database provider reported");

  await client.close();

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
