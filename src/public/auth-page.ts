/**
 * Auth page — login, register, verify, and forgot-password views.
 * Inline SPA with dark theme matching admin.
 */

import { config } from "../lib/config.js";

export function renderAuthPage(): string {
  const isSaas = config.edition === "saas";
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Butt-Dial — Sign In</title>
  <style>
    :root {
      --bg-body: #0f1117;
      --bg-card: #161b22;
      --bg-input: #0d1117;
      --border: #21262d;
      --border-focus: #58a6ff;
      --text: #e1e4e8;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --success: #3fb950;
      --success-bg: #0d2818;
      --error: #f85149;
      --error-bg: #2d1b1b;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    }

    [data-theme="light"] {
      --bg-body: #f5f6f8;
      --bg-card: #ffffff;
      --bg-input: #f0f1f3;
      --border: #d0d7de;
      --border-focus: #0969da;
      --text: #1f2328;
      --text-muted: #656d76;
      --text-heading: #1f2328;
      --accent: #0969da;
      --accent-hover: #0550ae;
      --success: #1a7f37;
      --success-bg: #dafbe1;
      --error: #cf222e;
      --error-bg: #ffebe9;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg-body);
      color: var(--text);
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 24px;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    .logo {
      font-size: 28px; font-weight: 700; color: var(--text-heading);
      margin-bottom: 32px; text-align: center;
    }
    .logo a { color: var(--text-heading); }
    .logo span { font-size: 32px; margin-right: 8px; }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      width: 100%;
      max-width: 420px;
    }
    .card h2 {
      font-size: 22px; font-weight: 600; color: var(--text-heading);
      margin-bottom: 24px; text-align: center;
    }

    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block; font-size: 13px; font-weight: 500;
      color: var(--text-muted); margin-bottom: 6px;
    }
    .form-group input {
      width: 100%; padding: 10px 12px; font-size: 14px;
      background: var(--bg-input); color: var(--text);
      border: 1px solid var(--border); border-radius: 6px;
      outline: none; transition: border-color 0.2s;
    }
    .form-group input:focus { border-color: var(--border-focus); }

    .btn {
      width: 100%; padding: 12px; font-size: 15px; font-weight: 600;
      background: var(--accent); color: #fff; border: none;
      border-radius: 6px; cursor: pointer; transition: background 0.2s;
      margin-top: 8px;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .toggle { text-align: center; margin-top: 20px; font-size: 14px; color: var(--text-muted); }

    .alert {
      padding: 10px 14px; border-radius: 6px; font-size: 13px;
      margin-bottom: 16px; display: none;
    }
    .alert-error { background: var(--error-bg); color: var(--error); border: 1px solid rgba(248,81,73,0.3); }
    .alert-success { background: var(--success-bg); color: var(--success); border: 1px solid rgba(63,185,80,0.3); }
    .alert.show { display: block; }

    .view { display: none; }
    .view.active { display: block; }

    .back-link {
      display: block; text-align: center; margin-top: 24px;
      font-size: 14px; color: var(--text-muted);
    }

    /* Password eye toggle */
    .pw-wrap {
      position: relative;
    }
    .pw-wrap input { padding-right: 40px; }
    .pw-toggle {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 16px; padding: 4px;
      line-height: 1; display: flex; align-items: center;
    }
    .pw-toggle:hover { color: var(--text); }

    .theme-toggle-btn {
      position: fixed; top: 16px; right: 16px; z-index: 100;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
      color: var(--text-muted); cursor: pointer; padding: 6px 8px;
      display: flex; align-items: center; transition: color 0.15s, border-color 0.15s;
    }
    .theme-toggle-btn:hover { color: var(--text); border-color: var(--text-muted); }
    .theme-toggle-btn svg { width: 18px; height: 18px; }
  </style>
  <script>(function(){var t=localStorage.getItem('bd-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');})();</script>
</head>
<body>

  <button class="theme-toggle-btn" id="theme-toggle" title="Toggle light/dark mode">
    <svg id="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
    <svg id="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
  </button>

  <div class="logo"><a href="/"><span>&#128222;</span>Butt-Dial</a></div>

  <div class="card">
    <!-- Login View -->
    <div id="login-view" class="view active">
      <h2>Sign In</h2>
      <div id="login-alert" class="alert alert-error"></div>
      <form id="login-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="login-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <div class="pw-wrap">
            <input type="password" id="login-password" required autocomplete="current-password">
            <button type="button" class="pw-toggle" onclick="togglePw(this)" aria-label="Show password">&#128065;</button>
          </div>
        </div>
        <button type="submit" class="btn" id="login-btn">Sign In</button>
      </form>
      <p class="toggle">
        <a href="#" onclick="showView('forgot')">Forgot password?</a>
      </p>
      <p class="toggle">
        Don't have an account? <a href="#" onclick="showView('register')">Register</a>
      </p>
    </div>

    <!-- Register View -->
    <div id="register-view" class="view">
      <h2>Create Account</h2>
      <div id="register-alert" class="alert alert-error"></div>
      <form id="register-form">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="reg-fullname" required minlength="2" autocomplete="name" placeholder="Your full name">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="reg-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Phone Number <span style="font-size:11px;color:var(--text-muted);">(optional)</span></label>
          <input type="tel" id="reg-phone" autocomplete="tel" placeholder="+1234567890">
        </div>
        <div class="form-group">
          <label>Password (min 8 characters)</label>
          <div class="pw-wrap">
            <input type="password" id="reg-password" required minlength="8" autocomplete="new-password">
            <button type="button" class="pw-toggle" onclick="togglePw(this)" aria-label="Show password">&#128065;</button>
          </div>
        </div>
        ${isSaas ? `
        <div class="form-group">
          <label>Company Name</label>
          <input type="text" id="reg-company" placeholder="Your company's legal name">
        </div>
        <div class="form-group">
          <label>Website</label>
          <input type="url" id="reg-website" placeholder="https://example.com">
        </div>
        <div class="form-group">
          <label>Use Case</label>
          <input type="text" id="reg-usecase" placeholder="Briefly describe how you'll use the API">
        </div>
        ` : ""}
        <div class="form-group" style="display:flex;align-items:flex-start;gap:10px;">
          <input type="checkbox" id="reg-tos" required style="margin-top:3px;width:auto;flex-shrink:0;">
          <label for="reg-tos" style="font-size:13px;color:var(--text-muted);cursor:pointer;">
            I agree to the <a href="/legal/terms" target="_blank">Terms of Service</a> and <a href="/legal/aup" target="_blank">Acceptable Use Policy</a>
          </label>
        </div>
        <button type="submit" class="btn" id="register-btn">Create Account</button>
      </form>
      <p class="toggle">
        Already have an account? <a href="#" onclick="showView('login')">Sign In</a>
      </p>
    </div>

    <!-- Verify View -->
    <div id="verify-view" class="view">
      <h2>Verify Your Email</h2>
      <div id="verify-alert" class="alert alert-error"></div>
      <div id="verify-success-alert" class="alert alert-success"></div>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:16px;text-align:center;">
        We sent a 6-digit code to <strong id="verify-email-display"></strong>
      </p>
      <form id="verify-form">
        <div class="form-group">
          <label>Verification Code</label>
          <input type="text" id="verify-code" required maxlength="6" pattern="[0-9]{6}"
                 placeholder="000000" style="text-align:center;font-size:24px;letter-spacing:8px;">
        </div>
        <button type="submit" class="btn" id="verify-btn">Verify Email</button>
      </form>
      <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
        <a href="#" onclick="showView('register')" style="font-size:13px;">&larr; Back to fix email</a>
        <button type="button" id="resend-btn" onclick="resendCode()" style="background:none;border:1px solid var(--border);color:var(--accent);padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;" disabled>Resend code (60s)</button>
      </div>
    </div>

    <!-- Forgot Password View -->
    <div id="forgot-view" class="view">
      <h2>Reset Password</h2>
      <div id="forgot-alert" class="alert alert-error"></div>
      <div id="forgot-success" class="alert alert-success"></div>

      <!-- Step 1: Request code -->
      <div id="forgot-step1">
        <form id="forgot-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="forgot-email" required autocomplete="email">
          </div>
          <button type="submit" class="btn">Send Reset Code</button>
        </form>
      </div>

      <!-- Step 2: Enter code + new password -->
      <div id="forgot-step2" style="display:none;">
        <form id="reset-form">
          <div class="form-group">
            <label>Reset Code</label>
            <input type="text" id="reset-code" required maxlength="6" pattern="[0-9]{6}"
                   placeholder="000000" style="text-align:center;font-size:20px;letter-spacing:6px;">
          </div>
          <div class="form-group">
            <label>New Password (min 8 characters)</label>
            <div class="pw-wrap">
              <input type="password" id="reset-password" required minlength="8" autocomplete="new-password">
              <button type="button" class="pw-toggle" onclick="togglePw(this)" aria-label="Show password">&#128065;</button>
            </div>
          </div>
          <button type="submit" class="btn">Reset Password</button>
        </form>
      </div>

      <p class="toggle">
        <a href="#" onclick="showView('login')">Back to Sign In</a>
      </p>
    </div>
  </div>

  <a href="/" class="back-link">Back to home</a>

<script>
  // ── View switching ─────────────────────────
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(name + '-view').classList.add('active');
    // Clear alerts
    document.querySelectorAll('.alert').forEach(a => { a.classList.remove('show'); a.textContent = ''; });
  }

  function showError(prefix, msg) {
    const el = document.getElementById(prefix + '-alert');
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }

  let pendingEmail = '';

  // ── Register ───────────────────────────────
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Creating...';

    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const orgName = email.split('@')[0];
    const tosAccepted = document.getElementById('reg-tos').checked;

    if (!fullName || fullName.length < 2) {
      showError('register', 'Full name is required (min 2 characters).');
      btn.disabled = false; btn.textContent = 'Create Account';
      return;
    }

    if (!tosAccepted) {
      showError('register', 'You must accept the Terms of Service to register.');
      btn.disabled = false; btn.textContent = 'Create Account';
      return;
    }

    // Collect optional KYC fields (SaaS only)
    const payload = { email, password, orgName, tosAccepted, fullName, phone };
    const companyEl = document.getElementById('reg-company');
    const websiteEl = document.getElementById('reg-website');
    const usecaseEl = document.getElementById('reg-usecase');
    if (companyEl) payload.companyName = companyEl.value.trim();
    if (websiteEl) payload.website = websiteEl.value.trim();
    if (usecaseEl) payload.useCase = usecaseEl.value.trim();

    try {
      const res = await fetch('/auth/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('register', data.error || 'Registration failed');
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }
      // If no email verification required, redirect directly
      if (data.requiresVerification === false && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      // Otherwise show OTP verify view
      pendingEmail = data.email;
      document.getElementById('verify-email-display').textContent = pendingEmail;
      showView('verify');
      startResendCooldown();
    } catch (err) {
      showError('register', 'Network error. Try again.');
    }
    btn.disabled = false; btn.textContent = 'Create Account';
  });

  // ── Resend code with cooldown ──────────────
  let resendTimer = null;
  function startResendCooldown() {
    const btn = document.getElementById('resend-btn');
    let seconds = 60;
    btn.disabled = true;
    btn.textContent = 'Resend code (' + seconds + 's)';
    resendTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = 'Resend code';
      } else {
        btn.textContent = 'Resend code (' + seconds + 's)';
      }
    }, 1000);
  }

  window.resendCode = async function() {
    if (!pendingEmail) return;
    const btn = document.getElementById('resend-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      await fetch('/auth/api/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
    } catch (e) {}
    startResendCooldown();
    const sa = document.getElementById('verify-success-alert');
    sa.textContent = 'A new code has been sent.';
    sa.classList.add('show');
  };

  // ── Verify ─────────────────────────────────
  document.getElementById('verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = 'Verifying...';

    const code = document.getElementById('verify-code').value;

    try {
      const res = await fetch('/auth/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('verify', data.error || 'Verification failed');
        btn.disabled = false; btn.textContent = 'Verify Email';
        return;
      }
      // Redirect straight to admin (session cookie set by server)
      window.location.href = data.redirect || '/admin';
    } catch (err) {
      showError('verify', 'Network error. Try again.');
    }
    btn.disabled = false; btn.textContent = 'Verify Email';
  });

  // ── Login ──────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/auth/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('login', data.error || 'Login failed');
        btn.disabled = false; btn.textContent = 'Sign In';
        return;
      }
      // Redirect straight to admin (session cookie set by server)
      window.location.href = data.redirect || '/admin';
    } catch (err) {
      showError('login', 'Network error. Try again.');
    }
    btn.disabled = false; btn.textContent = 'Sign In';
  });

  // ── Forgot password ────────────────────────
  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    try {
      const res = await fetch('/auth/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        pendingEmail = email;
        const s = document.getElementById('forgot-success');
        s.textContent = data.message || 'Check your email for a reset code.';
        s.classList.add('show');
        document.getElementById('forgot-step1').style.display = 'none';
        document.getElementById('forgot-step2').style.display = 'block';
      } else {
        showError('forgot', data.error || 'Request failed');
      }
    } catch (err) {
      showError('forgot', 'Network error. Try again.');
    }
  });

  // ── Reset password ─────────────────────────
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('reset-code').value;
    const newPassword = document.getElementById('reset-password').value;

    try {
      const res = await fetch('/auth/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showView('login');
        const el = document.getElementById('login-alert');
        el.className = 'alert alert-success show';
        el.textContent = 'Password reset successful. Sign in with your new password.';
      } else {
        showError('forgot', data.error || 'Reset failed');
      }
    } catch (err) {
      showError('forgot', 'Network error. Try again.');
    }
  });

  // ── Theme toggle ──────────────────────────
  (function() {
    var tbtn = document.getElementById('theme-toggle');
    var moonIcon = document.getElementById('theme-icon-moon');
    var sunIcon = document.getElementById('theme-icon-sun');
    function applyTheme(theme) {
      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        moonIcon.style.display = 'none'; sunIcon.style.display = '';
      } else {
        document.documentElement.removeAttribute('data-theme');
        moonIcon.style.display = ''; sunIcon.style.display = 'none';
      }
    }
    applyTheme(localStorage.getItem('bd-theme') || 'dark');
    tbtn.addEventListener('click', function() {
      var current = localStorage.getItem('bd-theme') || 'dark';
      var next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bd-theme', next);
      applyTheme(next);
    });
  })();

  // ── Toggle password visibility ─────────────
  function togglePw(btn) {
    const input = btn.parentElement.querySelector('input');
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '&#128064;';
    } else {
      input.type = 'password';
      btn.innerHTML = '&#128065;';
    }
  }

</script>

</body>
</html>`;
}
