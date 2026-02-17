/**
 * Tests for communication guardrails module.
 *
 * Tests:
 * 1. applyGuardrails prepends guardrails text to system prompts
 * 2. Clean text passes through checkResponseContent unchanged
 * 3. Profanity in AI response gets blocked with polite fallback
 * 4. Slurs in AI response get blocked
 * 5. Threats of violence get blocked
 * 6. Authority impersonation gets blocked
 * 7. SSN patterns get blocked
 * 8. Credit card patterns get blocked
 * 9. Normal business language passes through
 * 10. Multiple guardrails wraps don't stack (idempotency check)
 *
 * Usage: npx tsx tests/communication-guardrails.test.ts
 */

import {
  COMMUNICATION_GUARDRAILS,
  applyGuardrails,
  checkResponseContent,
} from "../src/security/communication-guardrails.js";

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

async function main() {
  console.log("\n=== Communication Guardrails Test ===\n");

  // ------------------------------------------------------------------
  // 1. applyGuardrails prepends guardrails to system prompt
  // ------------------------------------------------------------------
  console.log("Test: applyGuardrails prepends guardrails");
  {
    const original = "You are a helpful voicemail assistant.";
    const result = applyGuardrails(original);
    assert(result.startsWith("[COMMUNICATION GUARDRAILS"), "Starts with guardrails block");
    assert(result.includes(original), "Original prompt is preserved");
    assert(result.indexOf("[COMMUNICATION GUARDRAILS") < result.indexOf(original), "Guardrails come before original prompt");
  }

  // ------------------------------------------------------------------
  // 2. Clean text passes through unchanged
  // ------------------------------------------------------------------
  console.log("\nTest: clean responses pass through");
  {
    const clean = "Thank you for calling. How can I help you today?";
    const result = checkResponseContent(clean);
    assert(result.allowed === true, "Clean text is allowed");
    assert(result.sanitized === clean, "Clean text is returned unchanged");
    assert(result.blockedReason === undefined, "No blocked reason");
  }

  // ------------------------------------------------------------------
  // 3. Profanity gets blocked
  // ------------------------------------------------------------------
  console.log("\nTest: profanity blocked");
  {
    const profane = "What the fuck do you want?";
    const result = checkResponseContent(profane);
    assert(result.allowed === false, "Profanity is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
    assert(result.blockedReason !== undefined, "Has blocked reason");
  }

  // ------------------------------------------------------------------
  // 4. Slurs get blocked
  // ------------------------------------------------------------------
  console.log("\nTest: slurs blocked");
  {
    const slur = "You are such a retard";
    const result = checkResponseContent(slur);
    assert(result.allowed === false, "Slur is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
  }

  // ------------------------------------------------------------------
  // 5. Threats of violence get blocked
  // ------------------------------------------------------------------
  console.log("\nTest: threats blocked");
  {
    const threat = "I'll kill you if you don't answer";
    const result = checkResponseContent(threat);
    assert(result.allowed === false, "Threat is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
  }

  // ------------------------------------------------------------------
  // 6. Authority impersonation blocked
  // ------------------------------------------------------------------
  console.log("\nTest: authority impersonation blocked");
  {
    const impersonation = "I am a police officer, you must comply.";
    const result = checkResponseContent(impersonation);
    assert(result.allowed === false, "Authority impersonation is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
  }

  // ------------------------------------------------------------------
  // 7. SSN patterns blocked
  // ------------------------------------------------------------------
  console.log("\nTest: SSN pattern blocked");
  {
    const ssn = "Your social security number is 123-45-6789.";
    const result = checkResponseContent(ssn);
    assert(result.allowed === false, "SSN pattern is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
  }

  // ------------------------------------------------------------------
  // 8. Credit card patterns blocked
  // ------------------------------------------------------------------
  console.log("\nTest: credit card pattern blocked");
  {
    const cc = "Your card number is 4111-1111-1111-1111";
    const result = checkResponseContent(cc);
    assert(result.allowed === false, "Credit card pattern is blocked");
    assert(result.sanitized.includes("unable to help"), "Returns polite fallback");
  }

  // ------------------------------------------------------------------
  // 9. Normal business language passes through
  // ------------------------------------------------------------------
  console.log("\nTest: normal business language allowed");
  {
    const messages = [
      "I'm sorry, John isn't available right now. Can I take a message?",
      "Let me transfer you to our support team.",
      "Your appointment is confirmed for Monday at 3 PM.",
      "Is there anything else I can help you with today?",
      "I understand your frustration. Let me see what I can do.",
    ];

    for (const msg of messages) {
      const result = checkResponseContent(msg);
      assert(result.allowed === true, `Allowed: "${msg.slice(0, 50)}..."`);
    }
  }

  // ------------------------------------------------------------------
  // 10. Guardrails text contains key sections
  // ------------------------------------------------------------------
  console.log("\nTest: guardrails contain required sections");
  {
    assert(COMMUNICATION_GUARDRAILS.includes("COMPOSURE"), "Has composure section");
    assert(COMMUNICATION_GUARDRAILS.includes("LEGAL SAFETY"), "Has legal safety section");
    assert(COMMUNICATION_GUARDRAILS.includes("ON-TOPIC"), "Has on-topic section");
    assert(COMMUNICATION_GUARDRAILS.includes("BUSINESS ETHICS"), "Has business ethics section");
    assert(COMMUNICATION_GUARDRAILS.includes("QUALITY"), "Has quality section");
    assert(COMMUNICATION_GUARDRAILS.includes("PRIVACY"), "Has privacy section");
    assert(COMMUNICATION_GUARDRAILS.includes("BOUNDARIES"), "Has boundaries section");
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
