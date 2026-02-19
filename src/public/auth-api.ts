/**
 * Auth API — registration, email verification, login, password reset.
 * Mounted at /auth/api by index.ts.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { hashPassword, verifyPassword } from "./password.js";
import { createOrganization, generateOrgToken } from "../lib/org-manager.js";
import { generateOtp, verifyOtp } from "../security/otp.js";
import { getProvider } from "../providers/factory.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export const authApiRouter = Router();

// ── Types ────────────────────────────────────────────────────────

interface UserAccount {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  org_id: string;
  email_verified: number;
  pending_token_enc: string | null;
  locked_until: string | null;
  failed_login_attempts: number;
}

// ── Rate limiting (in-memory, per-IP) ────────────────────────────

const registrationAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRegistrationRate(ip: string): boolean {
  const now = Date.now();
  const entry = registrationAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    registrationAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

// ── Pending registrations (in-memory, expires in 10 min) ────────

interface PendingRegistration {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  orgName: string;
  expiresAt: number;
}

const pendingRegistrations = new Map<string, PendingRegistration>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingRegistrations) {
    if (now > entry.expiresAt) pendingRegistrations.delete(key);
  }
}, 5 * 60 * 1000);

// ── Token encryption helpers ────────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = config.credentialsEncryptionKey || config.masterSecurityToken || "default-dev-key-32chars-padding!";
  // Ensure 32 bytes for AES-256
  return Buffer.from(key.padEnd(32, "0").slice(0, 32));
}

function encryptToken(plainToken: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plainToken, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptToken(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedStr.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── POST /register ──────────────────────────────────────────────

authApiRouter.post("/register", (req: Request, res: Response) => {
  try {
    if (!config.registrationEnabled && !config.demoMode) {
      res.status(403).json({ error: "Registration is currently disabled" });
      return;
    }

    const { email, password, orgName, tosAccepted } = req.body ?? {};

    // Validate input
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    if (!orgName || typeof orgName !== "string" || orgName.trim().length < 2) {
      res.status(400).json({ error: "Account name is required (min 2 characters)" });
      return;
    }
    if (!tosAccepted) {
      res.status(400).json({ error: "You must accept the Terms of Service to register" });
      return;
    }

    // Rate limit
    const ip = String(req.ip || req.socket.remoteAddress || "unknown");
    if (!checkRegistrationRate(ip)) {
      res.status(429).json({ error: "Too many registration attempts. Try again in an hour." });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = email.toLowerCase().trim();

    // Check duplicate email (in DB)
    const existing = db.query<{ id: string }>(
      "SELECT id FROM user_accounts WHERE email = ?",
      [normalizedEmail],
    );
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // Hash password and store in memory (account created only after OTP verification)
    const { hash, salt } = hashPassword(password);
    pendingRegistrations.set(normalizedEmail, {
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
      orgName: orgName.trim(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Generate OTP for email verification
    const { code } = generateOtp(db, "system", normalizedEmail, "email");

    // Send verification email (or log in demo mode)
    if (config.demoMode) {
      logger.info("registration_otp_demo", { email: normalizedEmail, code });
      console.log(`[DEMO] Verification code for ${normalizedEmail}: ${code}`);
    } else {
      sendVerificationEmail(normalizedEmail, code).catch((err) => {
        logger.error("verification_email_failed", { email: normalizedEmail, error: String(err) });
      });
    }

    logger.info("registration_pending", { email: normalizedEmail });
    res.json({ success: true, email: normalizedEmail });
  } catch (err) {
    logger.error("register_error", { error: String(err) });
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── POST /resend-code ───────────────────────────────────────────

authApiRouter.post("/resend-code", (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = String(email).toLowerCase().trim();

    // Check if there's a pending registration
    const pending = pendingRegistrations.get(normalizedEmail);

    if (pending && Date.now() <= pending.expiresAt) {
      const { code } = generateOtp(db, "system", normalizedEmail, "email");
      if (config.demoMode) {
        logger.info("resend_otp_demo", { email: normalizedEmail, code });
        console.log(`[DEMO] Resent verification code for ${normalizedEmail}: ${code}`);
      } else {
        sendVerificationEmail(normalizedEmail, code).catch((err) => {
          logger.error("resend_verification_email_failed", { error: String(err) });
        });
      }
    }

    // Always return success (don't reveal if email exists)
    res.json({ success: true });
  } catch (err) {
    logger.error("resend_code_error", { error: String(err) });
    res.status(500).json({ error: "Failed to resend code" });
  }
});

// ── POST /verify-email ──────────────────────────────────────────

authApiRouter.post("/verify-email", (req: Request, res: Response) => {
  try {
    const { email, code } = req.body ?? {};

    if (!email || !code) {
      res.status(400).json({ error: "Email and verification code are required" });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = String(email).toLowerCase().trim();

    // Verify OTP first
    const result = verifyOtp(db, "system", normalizedEmail, String(code));
    if (!result.valid) {
      res.status(400).json({ error: result.reason || "Invalid code" });
      return;
    }

    // Check if already verified (account already exists)
    const existingUsers = db.query<UserAccount>(
      "SELECT * FROM user_accounts WHERE email = ?",
      [normalizedEmail],
    );
    if (existingUsers.length > 0) {
      res.status(400).json({ error: "Email already verified" });
      return;
    }

    // Get pending registration
    const pending = pendingRegistrations.get(normalizedEmail);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(normalizedEmail);
      res.status(410).json({ error: "Registration expired. Please register again." });
      return;
    }

    // Now create the account + org
    const slug = pending.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { org, rawToken } = createOrganization(db, pending.orgName, slug + "-" + randomUUID().slice(0, 8));

    const userId = randomUUID();
    db.run(
      `INSERT INTO user_accounts (id, email, password_hash, password_salt, org_id, email_verified, tos_accepted_at, account_status)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now'), 'pending_review')`,
      [userId, normalizedEmail, pending.passwordHash, pending.passwordSalt, org.id],
    );

    // Clean up pending registration
    pendingRegistrations.delete(normalizedEmail);

    logger.info("account_created", { email: normalizedEmail, orgId: org.id });
    res.json({ success: true, orgToken: rawToken, orgId: org.id });
  } catch (err) {
    logger.error("verify_email_error", { error: String(err) });
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ── POST /login ─────────────────────────────────────────────────

authApiRouter.post("/login", (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = String(email).toLowerCase().trim();

    // Find user
    const users = db.query<UserAccount>(
      "SELECT * FROM user_accounts WHERE email = ?",
      [normalizedEmail],
    );
    if (users.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = users[0];

    // Check lockout
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minute(s).` });
        return;
      }
      // Lockout expired — reset
      db.run("UPDATE user_accounts SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?", [user.id]);
      user.failed_login_attempts = 0;
      user.locked_until = null;
    }

    // Verify password
    if (!verifyPassword(String(password), user.password_hash, user.password_salt)) {
      const attempts = user.failed_login_attempts + 1;
      if (attempts >= 5) {
        // Lock for 15 minutes
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.run(
          "UPDATE user_accounts SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
          [attempts, lockUntil, user.id],
        );
        logger.warn("account_locked", { email: normalizedEmail, attempts });
        res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
        return;
      }
      db.run("UPDATE user_accounts SET failed_login_attempts = ? WHERE id = ?", [attempts, user.id]);
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Check email verified
    if (user.email_verified !== 1) {
      res.status(403).json({ error: "Please verify your email before logging in" });
      return;
    }

    // Success — reset failed attempts, update last login
    db.run(
      "UPDATE user_accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?",
      [user.id],
    );

    // Generate a fresh org token (old ones remain valid)
    const freshToken = generateOrgToken(db, user.org_id, `login-${normalizedEmail}`);

    logger.info("user_login", { email: normalizedEmail, orgId: user.org_id });
    res.json({ success: true, orgToken: freshToken, orgId: user.org_id });
  } catch (err) {
    logger.error("login_error", { error: String(err) });
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── POST /forgot-password ───────────────────────────────────────

authApiRouter.post("/forgot-password", (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = String(email).toLowerCase().trim();

    // Always return success (don't reveal if email exists)
    const users = db.query<{ id: string }>(
      "SELECT id FROM user_accounts WHERE email = ?",
      [normalizedEmail],
    );

    if (users.length > 0) {
      const { code } = generateOtp(db, "system", normalizedEmail, "email");

      if (config.demoMode) {
        logger.info("password_reset_otp_demo", { email: normalizedEmail, code });
        console.log(`[DEMO] Password reset code for ${normalizedEmail}: ${code}`);
      } else {
        sendPasswordResetEmail(normalizedEmail, code).catch((err) => {
          logger.error("password_reset_email_failed", { error: String(err) });
        });
      }
    }

    res.json({ success: true, message: "If that email is registered, a reset code has been sent." });
  } catch (err) {
    logger.error("forgot_password_error", { error: String(err) });
    res.status(500).json({ error: "Request failed. Please try again." });
  }
});

// ── POST /reset-password ────────────────────────────────────────

authApiRouter.post("/reset-password", (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body ?? {};

    if (!email || !code || !newPassword) {
      res.status(400).json({ error: "Email, code, and new password are required" });
      return;
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const db = getProvider("database");
    const normalizedEmail = String(email).toLowerCase().trim();

    // Verify OTP
    const result = verifyOtp(db, "system", normalizedEmail, String(code));
    if (!result.valid) {
      res.status(400).json({ error: result.reason || "Invalid code" });
      return;
    }

    // Hash new password
    const { hash, salt } = hashPassword(String(newPassword));

    // Update
    const updated = db.run(
      "UPDATE user_accounts SET password_hash = ?, password_salt = ?, failed_login_attempts = 0, locked_until = NULL WHERE email = ?",
      [hash, salt, normalizedEmail],
    );

    if (updated.changes === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    logger.info("password_reset", { email: normalizedEmail });
    res.json({ success: true });
  } catch (err) {
    logger.error("reset_password_error", { error: String(err) });
    res.status(500).json({ error: "Password reset failed. Please try again." });
  }
});

// ── Email helpers ───────────────────────────────────────────────

async function sendVerificationEmail(email: string, code: string): Promise<void> {
  try {
    const emailProvider = getProvider("email");
    await emailProvider.send({
      to: email,
      from: `noreply@${config.emailDefaultDomain}`,
      subject: "Verify your Butt-Dial account",
      body: `Your verification code is: ${code}. It expires in 5 minutes.`,
      html: `<h2>Welcome to Butt-Dial!</h2><p>Your verification code is:</p><h1 style="font-size:36px;letter-spacing:8px;color:#58a6ff;">${code}</h1><p>This code expires in 5 minutes.</p>`,
    });
  } catch (err) {
    logger.error("send_verification_email_failed", { email, error: String(err) });
  }
}

async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  try {
    const emailProvider = getProvider("email");
    await emailProvider.send({
      to: email,
      from: `noreply@${config.emailDefaultDomain}`,
      subject: "Reset your Butt-Dial password",
      body: `Your password reset code is: ${code}. It expires in 5 minutes.`,
      html: `<h2>Password Reset</h2><p>Your reset code is:</p><h1 style="font-size:36px;letter-spacing:8px;color:#58a6ff;">${code}</h1><p>This code expires in 5 minutes. If you didn't request this, ignore this email.</p>`,
    });
  } catch (err) {
    logger.error("send_password_reset_email_failed", { email, error: String(err) });
  }
}
