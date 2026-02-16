/**
 * Registration + Auth flow tests — runs against server with DEMO_MODE=true, REGISTRATION_ENABLED=true.
 *
 * Tests:
 * 1.  POST /auth/api/register with valid data returns success
 * 2.  POST /auth/api/register returns email in response
 * 3.  POST /auth/api/register with duplicate email returns 409
 * 4.  POST /auth/api/register without email returns 400
 * 5.  POST /auth/api/register with short password returns 400
 * 6.  POST /auth/api/register without org name returns 400
 * 7.  POST /auth/api/verify-email without code returns 400
 * 8.  POST /auth/api/verify-email with wrong code returns 400
 * 9.  POST /auth/api/login with wrong password returns 401
 * 10. POST /auth/api/login with unverified account returns 403
 * 11. POST /auth/api/login brute-force lockout after 5 failures
 * 12. POST /auth/api/forgot-password returns success (no leak)
 * 13. POST /auth/api/forgot-password with unknown email still returns success
 * 14. POST /auth/api/reset-password without code returns 400
 *
 * Unit tests (no server):
 * 15. hashPassword returns hash and salt
 * 16. verifyPassword validates correct password
 * 17. verifyPassword rejects wrong password
 * 18. hash and salt are different each time
 *
 * Usage: npx tsx tests/registration.test.ts
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

const testEmail = `test-${Date.now()}@example.com`;
const testPassword = "securepass123";
const testOrg = "Test Org";

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  return { status: res.status, data };
}

// ── Unit tests (password module) ─────────────────────────────────
async function testPasswordModule() {
  console.log("\n--- Password Module (Unit) ---");

  const { hashPassword, verifyPassword } = await import("../src/public/password.js");

  const result = hashPassword("testpass");
  assert(typeof result.hash === "string" && result.hash.length > 0, "15. hashPassword returns hash and salt");

  assert(verifyPassword("testpass", result.hash, result.salt) === true, "16. verifyPassword validates correct password");
  assert(verifyPassword("wrongpass", result.hash, result.salt) === false, "17. verifyPassword rejects wrong password");

  const result2 = hashPassword("testpass");
  assert(result.salt !== result2.salt, "18. hash and salt are different each time");
}

// ── Integration tests ────────────────────────────────────────────
async function testRegistration() {
  console.log("\n--- Registration ---");

  // Valid registration
  const reg = await post("/auth/api/register", { email: testEmail, password: testPassword, orgName: testOrg });
  assert(reg.status === 200 && reg.data.success === true, "1. Register with valid data returns success");
  assert(reg.data.email === testEmail.toLowerCase(), "2. Register returns email in response");

  // Duplicate email
  const dup = await post("/auth/api/register", { email: testEmail, password: testPassword, orgName: "Dup Org" });
  assert(dup.status === 409, "3. Duplicate email returns 409");

  // Missing email
  const noEmail = await post("/auth/api/register", { password: testPassword, orgName: testOrg });
  assert(noEmail.status === 400, "4. No email returns 400");

  // Short password
  const shortPw = await post("/auth/api/register", { email: "short@test.com", password: "abc", orgName: testOrg });
  assert(shortPw.status === 400, "5. Short password returns 400");

  // Missing org name
  const noOrg = await post("/auth/api/register", { email: "noorg@test.com", password: testPassword });
  assert(noOrg.status === 400, "6. No org name returns 400");
}

async function testVerification() {
  console.log("\n--- Email Verification ---");

  // No code
  const noCode = await post("/auth/api/verify-email", { email: testEmail });
  assert(noCode.status === 400, "7. Verify without code returns 400");

  // Wrong code
  const wrongCode = await post("/auth/api/verify-email", { email: testEmail, code: "000000" });
  assert(wrongCode.status === 400, "8. Verify with wrong code returns 400");
}

async function testLogin() {
  console.log("\n--- Login ---");

  // Wrong password
  const wrongPw = await post("/auth/api/login", { email: testEmail, password: "wrongpassword" });
  assert(wrongPw.status === 401 || wrongPw.status === 403, "9. Wrong password returns 401/403");

  // Unverified account (email not verified yet)
  const unverified = await post("/auth/api/login", { email: testEmail, password: testPassword });
  assert(unverified.status === 403, "10. Unverified account returns 403");

  // Brute force: 5 wrong attempts → lockout
  const bruteEmail = `brute-${Date.now()}@example.com`;
  await post("/auth/api/register", { email: bruteEmail, password: testPassword, orgName: "Brute Org" });

  for (let i = 0; i < 5; i++) {
    await post("/auth/api/login", { email: bruteEmail, password: "wrong" });
  }
  const locked = await post("/auth/api/login", { email: bruteEmail, password: "wrong" });
  assert(locked.status === 423, "11. Brute-force lockout after 5 failures");
}

async function testForgotPassword() {
  console.log("\n--- Forgot / Reset Password ---");

  // Forgot password
  const forgot = await post("/auth/api/forgot-password", { email: testEmail });
  assert(forgot.status === 200 && forgot.data.success === true, "12. Forgot password returns success");

  // Unknown email — still succeeds (no information leak)
  const unknown = await post("/auth/api/forgot-password", { email: "nobody@nowhere.com" });
  assert(unknown.status === 200 && unknown.data.success === true, "13. Unknown email still returns success");

  // Reset without code
  const noCode = await post("/auth/api/reset-password", { email: testEmail, newPassword: "newpass123" });
  assert(noCode.status === 400, "14. Reset without code returns 400");
}

// ── Run ─────────────────────────────────────────────────────────
async function main() {
  console.log("Registration + Auth Flow Tests");
  console.log("====================================");

  try {
    await testPasswordModule();
    await testRegistration();
    await testVerification();
    await testLogin();
    await testForgotPassword();
  } catch (err) {
    console.error("\nFatal error:", err);
    failed++;
  }

  console.log(`\n====================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
