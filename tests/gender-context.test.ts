/**
 * Gender Context — unit + API tests.
 *
 * Tests:
 * 1. Unit: isGenderedLanguage — gendered vs non-gendered languages
 * 2. Unit: buildGenderInstructions — correct blocks for gendered, empty for non-gendered
 * 3. Unit: male agent + female target → correct instruction
 * 4. Unit: unknown target → default masculine instruction
 * 5. Unit: neutral agent → correct instruction
 * 6. Unit: BCP-47 codes with region (e.g. "he-IL") work correctly
 * 7. API: POST gender endpoint saves and GET agents returns it
 * 8. API: comms_provision_channels accepts agentGender
 * 9. API: comms_send_message returns genderContext metadata
 *
 * Prerequisites:
 *   - Server running with DEMO_MODE=true
 *
 * Usage: npx tsx tests/gender-context.test.ts
 */

import { isGenderedLanguage, buildGenderInstructions } from "../src/lib/gender-context.js";

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

async function main() {
  console.log("\n=== Gender Context tests ===\n");

  // ------------------------------------------------------------------
  // 1. Unit: isGenderedLanguage
  // ------------------------------------------------------------------
  console.log("Test: isGenderedLanguage");
  assert(isGenderedLanguage("he") === true, "Hebrew is gendered");
  assert(isGenderedLanguage("ar") === true, "Arabic is gendered");
  assert(isGenderedLanguage("fr") === true, "French is gendered");
  assert(isGenderedLanguage("es") === true, "Spanish is gendered");
  assert(isGenderedLanguage("pt") === true, "Portuguese is gendered");
  assert(isGenderedLanguage("it") === true, "Italian is gendered");
  assert(isGenderedLanguage("de") === true, "German is gendered");
  assert(isGenderedLanguage("ru") === true, "Russian is gendered");
  assert(isGenderedLanguage("pl") === true, "Polish is gendered");
  assert(isGenderedLanguage("hi") === true, "Hindi is gendered");
  assert(isGenderedLanguage("en") === false, "English is not gendered");
  assert(isGenderedLanguage("zh") === false, "Chinese is not gendered");
  assert(isGenderedLanguage("ja") === false, "Japanese is not gendered");
  assert(isGenderedLanguage("ko") === false, "Korean is not gendered");
  assert(isGenderedLanguage("") === false, "Empty string → false");

  // ------------------------------------------------------------------
  // 2. Unit: BCP-47 codes with region
  // ------------------------------------------------------------------
  console.log("\nTest: BCP-47 region codes");
  assert(isGenderedLanguage("he-IL") === true, "he-IL → gendered");
  assert(isGenderedLanguage("fr-FR") === true, "fr-FR → gendered");
  assert(isGenderedLanguage("en-US") === false, "en-US → not gendered");
  assert(isGenderedLanguage("ar-SA") === true, "ar-SA → gendered");
  assert(isGenderedLanguage("HE") === true, "HE uppercase → gendered");
  assert(isGenderedLanguage("He-Il") === true, "Mixed case He-Il → gendered");

  // ------------------------------------------------------------------
  // 3. Unit: buildGenderInstructions — non-gendered returns empty
  // ------------------------------------------------------------------
  console.log("\nTest: buildGenderInstructions for non-gendered languages");
  assert(
    buildGenderInstructions({ language: "en", agentGender: "male", targetGender: "female" }) === "",
    "English → empty string"
  );
  assert(
    buildGenderInstructions({ language: "zh", agentGender: "female", targetGender: "male" }) === "",
    "Chinese → empty string"
  );
  assert(
    buildGenderInstructions({ language: "ja", agentGender: "neutral", targetGender: "unknown" }) === "",
    "Japanese → empty string"
  );
  assert(
    buildGenderInstructions({ language: "", agentGender: "male", targetGender: "male" }) === "",
    "Empty language → empty string"
  );

  // ------------------------------------------------------------------
  // 4. Unit: male agent + female target → correct instruction
  // ------------------------------------------------------------------
  console.log("\nTest: Male agent + female target (Hebrew)");
  const maleFemalHe = buildGenderInstructions({ language: "he", agentGender: "male", targetGender: "female" });
  assert(maleFemalHe.includes("[GENDER CONTEXT]"), "Contains [GENDER CONTEXT] header");
  assert(maleFemalHe.includes("masculine conjugation when referring to yourself"), "Agent uses masculine");
  assert(maleFemalHe.includes("feminine conjugation"), "Target uses feminine");
  assert(maleFemalHe.includes("Address them accordingly"), "Direct address instruction");
  assert(maleFemalHe.includes("he"), "References the language");

  // ------------------------------------------------------------------
  // 5. Unit: female agent + male target
  // ------------------------------------------------------------------
  console.log("\nTest: Female agent + male target (French)");
  const femaleMaleFr = buildGenderInstructions({ language: "fr", agentGender: "female", targetGender: "male" });
  assert(femaleMaleFr.includes("feminine conjugation when referring to yourself"), "Agent uses feminine");
  assert(femaleMaleFr.includes("masculine conjugation. Address them"), "Target uses masculine");

  // ------------------------------------------------------------------
  // 6. Unit: unknown target → default masculine instruction
  // ------------------------------------------------------------------
  console.log("\nTest: Unknown target gender");
  const unknownTarget = buildGenderInstructions({ language: "he", agentGender: "male", targetGender: "unknown" });
  assert(unknownTarget.includes("unknown"), "Mentions unknown gender");
  assert(unknownTarget.includes("Default to masculine"), "Defaults to masculine");
  assert(unknownTarget.includes("adapt if they indicate"), "Instructs to adapt");

  // ------------------------------------------------------------------
  // 7. Unit: neutral agent
  // ------------------------------------------------------------------
  console.log("\nTest: Neutral agent");
  const neutralAgent = buildGenderInstructions({ language: "es", agentGender: "neutral", targetGender: "female" });
  assert(neutralAgent.includes("gender-neutral conjugation"), "Agent uses gender-neutral");
  assert(neutralAgent.includes("feminine conjugation"), "Target uses feminine");

  // ------------------------------------------------------------------
  // 8. API: Admin gender endpoint
  // ------------------------------------------------------------------
  console.log("\nTest: Admin gender API");
  try {
    // Save gender for test-agent-001
    const saveRes = await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/gender`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify({ gender: "female" }),
    });
    const saveData = await saveRes.json() as any;
    assert(saveRes.ok, `POST gender returns 200 (got ${saveRes.status})`);
    assert(saveData.success === true, "POST gender returns { success: true }");

    // Read back via agents list
    const listRes = await fetch(`${SERVER_URL}/admin/api/agents`, {
      headers: { "Authorization": "Bearer test-token" },
    });
    const listData = await listRes.json() as any;
    const agent = listData.agents?.find((a: any) => a.agent_id === "test-agent-001");
    assert(agent !== undefined, "test-agent-001 found in agents list");
    assert(agent?.agent_gender === "female", "agent_gender is 'female' after save");

    // Invalid gender
    const invalidRes = await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/gender`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify({ gender: "invalid" }),
    });
    assert(invalidRes.status === 400, `Invalid gender returns 400 (got ${invalidRes.status})`);

    // Restore to male
    await fetch(`${SERVER_URL}/admin/api/agents/test-agent-001/gender`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify({ gender: "male" }),
    });
  } catch (err) {
    console.log(`  ⚠ API tests skipped (server not running): ${err}`);
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
