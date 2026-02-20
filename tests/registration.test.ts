/**
 * Registration + Auth flow tests — runs against server with DEMO_MODE=true, REGISTRATION_ENABLED=true.
 * Default: REQUIRE_EMAIL_VERIFICATION=false (accounts created immediately).
 *
 * Tests:
 * 1.  POST /auth/api/register with valid data returns success
 * 2.  POST /auth/api/register returns requiresVerification: false (no OTP)
 * 3.  POST /auth/api/register returns redirect to /admin
 * 4.  POST /auth/api/register with duplicate email returns 409
 * 5.  POST /auth/api/register without email returns 400
 * 6.  POST /auth/api/register with short password returns 400
 * 7.  POST /auth/api/register without tosAccepted returns 400
 * 8.  POST /auth/api/login with correct credentials returns success
 * 9.  POST /auth/api/login with wrong password returns 401
 * 10. POST /auth/api/login brute-force lockout after 5 failures
 * 11. POST /auth/api/forgot-password returns success (no leak)
 * 12. POST /auth/api/forgot-password with unknown email still returns success
 * 13. POST /auth/api/reset-password without code returns 400
 *
 * Unit tests (no server):
 * 14. hashPassword returns hash and salt
 * 15. verifyPassword validates correct password
 * 16. verifyPassword rejects wrong password
 * 17. hash and salt are different each time
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
const testFullName = "Test User";
const bruteEmail = `brute-${Date.now()}@example.com`;

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
  assert(typeof result.hash === "string" && result.hash.length > 0, "14. hashPassword returns hash and salt");

  assert(verifyPassword("testpass", result.hash, result.salt) === true, "15. verifyPassword validates correct password");
  assert(verifyPassword("wrongpass", result.hash, result.salt) === false, "16. verifyPassword rejects wrong password");

  const result2 = hashPassword("testpass");
  assert(result.salt !== result2.salt, "17. hash and salt are different each time");
}

// ── Integration tests ────────────────────────────────────────────
async function testRegistration() {
  console.log("\n--- Registration (no OTP) ---");

  // Valid registration — should create account immediately (orgName auto-derived from email)
  const reg = await post("/auth/api/register", {
    email: testEmail, password: testPassword,
    tosAccepted: true, fullName: testFullName, phone: "+1234567890",
  });
  assert(reg.status === 200 && reg.data.success === true, "1. Register with valid data returns success");
  assert(reg.data.requiresVerification === false, "2. Register returns requiresVerification: false");
  assert(reg.data.redirect === "/admin", "3. Register returns redirect to /admin");

  // Duplicate email
  const dup = await post("/auth/api/register", {
    email: testEmail, password: testPassword, tosAccepted: true, fullName: "Dup User",
  });
  assert(dup.status === 409, "4. Duplicate email returns 409");

  // Missing email
  const noEmail = await post("/auth/api/register", {
    password: testPassword, tosAccepted: true, fullName: testFullName,
  });
  assert(noEmail.status === 400, "5. No email returns 400");

  // Short password
  const shortPw = await post("/auth/api/register", {
    email: "short@test.com", password: "abc", tosAccepted: true, fullName: testFullName,
  });
  assert(shortPw.status === 400, "6. Short password returns 400");

  // Missing TOS
  const noTos = await post("/auth/api/register", {
    email: "notos@test.com", password: testPassword, fullName: testFullName,
  });
  assert(noTos.status === 400, "7. No tosAccepted returns 400");

}

// Register brute-force account early (before rate limit exhaustion)
async function registerBruteForceAccount() {
  // This consumes a rate-limit slot, so call it before duplicate/validation tests
  const reg = await post("/auth/api/register", {
    email: bruteEmail, password: testPassword, tosAccepted: true, fullName: "Brute User",
  });
  if (reg.status !== 200) {
    console.warn(`  [warn] Brute-force account registration returned ${reg.status}: ${JSON.stringify(reg.data)}`);
  }
}

async function testLogin() {
  console.log("\n--- Login ---");

  // Login with correct credentials (account was created without OTP, should work)
  const login = await post("/auth/api/login", { email: testEmail, password: testPassword });
  assert(login.status === 200 && login.data.success === true, "8. Login with correct credentials returns success");

  // Wrong password
  const wrongPw = await post("/auth/api/login", { email: testEmail, password: "wrongpassword" });
  assert(wrongPw.status === 401, "9. Wrong password returns 401");

  // Brute force: 5 wrong attempts → lockout (account pre-registered)
  for (let i = 0; i < 5; i++) {
    await post("/auth/api/login", { email: bruteEmail, password: "wrong" });
  }
  const locked = await post("/auth/api/login", { email: bruteEmail, password: "wrong" });
  assert(locked.status === 423, "10. Brute-force lockout after 5 failures");
}

async function testForgotPassword() {
  console.log("\n--- Forgot / Reset Password ---");

  // Forgot password
  const forgot = await post("/auth/api/forgot-password", { email: testEmail });
  assert(forgot.status === 200 && forgot.data.success === true, "11. Forgot password returns success");

  // Unknown email — still succeeds (no information leak)
  const unknown = await post("/auth/api/forgot-password", { email: "nobody@nowhere.com" });
  assert(unknown.status === 200 && unknown.data.success === true, "12. Unknown email still returns success");

  // Reset without code
  const noCode = await post("/auth/api/reset-password", { email: testEmail, newPassword: "newpass123" });
  assert(noCode.status === 400, "13. Reset without code returns 400");
}

// ── Run ─────────────────────────────────────────────────────────
async function main() {
  console.log("Registration + Auth Flow Tests");
  console.log("====================================");

  try {
    await testPasswordModule();
    await registerBruteForceAccount();
    await testRegistration();
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
