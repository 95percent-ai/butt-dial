/**
 * Landing page tests — verifies GET / loads correctly with all expected sections.
 *
 * Integration tests (server with DEMO_MODE=true):
 * 1. GET / returns 200
 * 2. Has title with "Butt-Dial"
 * 3. Has hero section with CTA
 * 4. Has "Get Started Free" link
 * 5. Has Phone Calls feature card
 * 6. Has SMS feature card
 * 7. Has Email feature card
 * 8. Has WhatsApp feature card
 * 9. Has "How It Works" section
 * 10. Has 3 steps (Register, Connect, Communicate)
 * 11. Has "Why Butt-Dial" section
 * 12. Has GitHub link
 * 13. Has wiki link
 * 14. Has footer with 95percent.ai credit
 * 15. Has nav with login link
 * 16. GET /auth/login returns 200
 * 17. Auth page has login form
 * 18. Auth page has register link
 *
 * Usage: npx tsx tests/landing-page.test.ts
 */

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

async function testLandingPage() {
  console.log("\n--- Landing Page ---");

  const res = await fetch(`${SERVER_URL}/`);
  assert(res.status === 200, "1. GET / returns 200");

  const html = await res.text();
  assert(html.includes("Butt-Dial"), "2. Has title with Butt-Dial");
  assert(html.includes("hero") && html.includes("Phone Number"), "3. Has hero section with CTA");
  assert(html.includes("Get Started Free"), "4. Has Get Started Free link");
  assert(html.includes("Phone Calls"), "5. Has Phone Calls feature card");
  assert(html.includes("SMS"), "6. Has SMS feature card");
  assert(html.includes("Email"), "7. Has Email feature card");
  assert(html.includes("WhatsApp"), "8. Has WhatsApp feature card");
  assert(html.includes("how-it-works"), "9. Has How It Works section");
  assert(html.includes("Register") && html.includes("Connect API Keys") && html.includes("Start Communicating"), "10. Has 3 steps");
  assert(html.includes("Why Butt-Dial"), "11. Has Why Butt-Dial section");
  assert(html.includes("github.com"), "12. Has GitHub link");
  assert(html.includes("wiki"), "13. Has wiki link");
  assert(html.includes("95percent.ai"), "14. Has footer credit");
  assert(html.includes("/auth/login"), "15. Has nav login link");
}

async function testAuthPage() {
  console.log("\n--- Auth Page ---");

  const res = await fetch(`${SERVER_URL}/auth/login`);
  assert(res.status === 200, "16. GET /auth/login returns 200");

  const html = await res.text();
  assert(html.includes("login-form") && html.includes("Sign In"), "17. Auth page has login form");
  assert(html.includes("register") || html.includes("Register"), "18. Auth page has register link");
}

// ── Run ─────────────────────────────────────────────────────────
async function main() {
  console.log("Landing Page + Auth Page Tests");
  console.log("====================================");

  try {
    await testLandingPage();
    await testAuthPage();
  } catch (err) {
    console.error("\nFatal error:", err);
    failed++;
  }

  console.log(`\n====================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
