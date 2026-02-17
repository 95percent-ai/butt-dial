/**
 * Auth page — login, register, verify, and forgot-password views.
 * Inline SPA with dark theme matching admin.
 */

export function renderAuthPage(): string {
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

    /* Token reveal */
    .token-box {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      margin: 16px 0;
      word-break: break-all;
      font-family: monospace;
      font-size: 13px;
      color: var(--accent);
      position: relative;
    }
    .token-warning {
      background: rgba(210,153,34,0.15);
      border: 1px solid rgba(210,153,34,0.3);
      color: #d29922;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .btn-copy {
      padding: 8px 16px; font-size: 13px; font-weight: 500;
      background: transparent; color: var(--accent);
      border: 1px solid var(--border); border-radius: 6px;
      cursor: pointer; margin-right: 8px; transition: all 0.2s;
    }
    .btn-copy:hover { border-color: var(--accent); }
    .actions { display: flex; gap: 8px; margin-top: 12px; }

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
  </style>
</head>
<body>

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
          <label>Email</label>
          <input type="email" id="reg-email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password (min 8 characters)</label>
          <div class="pw-wrap">
            <input type="password" id="reg-password" required minlength="8" autocomplete="new-password">
            <button type="button" class="pw-toggle" onclick="togglePw(this)" aria-label="Show password">&#128065;</button>
          </div>
        </div>
        <div class="form-group">
          <label>Organization Name</label>
          <input type="text" id="reg-org" required minlength="2" placeholder="My Company">
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
    </div>

    <!-- Token Reveal View -->
    <div id="token-view" class="view">
      <h2>You're All Set!</h2>
      <div class="token-warning">
        Save this token now! It cannot be recovered later. You'll use it to access the admin panel.
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Your organization token:</p>
      <div class="token-box" id="token-display"></div>
      <div class="actions">
        <button class="btn-copy" onclick="copyToken()">Copy Token</button>
        <a href="/admin" class="btn" style="text-align:center;text-decoration:none;flex:1;">Go to Admin Panel</a>
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
  let revealedToken = '';

  // ── Register ───────────────────────────────
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Creating...';

    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const orgName = document.getElementById('reg-org').value;

    try {
      const res = await fetch('/auth/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, orgName }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('register', data.error || 'Registration failed');
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }
      // Switch to verify view
      pendingEmail = data.email;
      document.getElementById('verify-email-display').textContent = pendingEmail;
      showView('verify');
    } catch (err) {
      showError('register', 'Network error. Try again.');
    }
    btn.disabled = false; btn.textContent = 'Create Account';
  });

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
      // Show token
      revealedToken = data.orgToken || '';
      document.getElementById('token-display').textContent = revealedToken;
      showView('token');
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
      // Show token
      revealedToken = data.orgToken || '';
      document.getElementById('token-display').textContent = revealedToken;
      showView('token');
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

  // ── Copy token ─────────────────────────────
  function copyToken() {
    navigator.clipboard.writeText(revealedToken).then(() => {
      const btn = document.querySelector('.btn-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Token'; }, 2000);
    });
  }
</script>

</body>
</html>`;
}
