/**
 * Disclaimer acceptance page — mandatory gate before admin access.
 * Records acceptance with user_id, org_id, version, IP, user-agent.
 * Same dark theme as auth-page.ts.
 */

export const DISCLAIMER_VERSION = "1.0";

export function renderDisclaimerPage(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Platform Usage Disclaimer — Butt-Dial</title>
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
      --error: #cf222e;
      --error-bg: #ffebe9;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg-body);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    .disclaimer-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 700px;
    }

    .disclaimer-box h1 {
      font-size: 1.5rem;
      color: var(--text-heading);
      margin-bottom: 0.5rem;
      text-align: center;
    }

    .disclaimer-box .subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .disclaimer-scroll {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 1.5rem;
      line-height: 1.65;
      font-size: 0.875rem;
    }

    .disclaimer-scroll h2 {
      font-size: 1rem;
      color: var(--text-heading);
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }

    .disclaimer-scroll h2:first-child { margin-top: 0; }

    .disclaimer-scroll p {
      margin-bottom: 0.75rem;
      color: var(--text);
    }

    .disclaimer-scroll ul {
      margin-bottom: 0.75rem;
      padding-left: 1.25rem;
    }

    .disclaimer-scroll li {
      margin-bottom: 0.35rem;
      color: var(--text);
    }

    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 1rem;
      cursor: pointer;
    }

    .checkbox-row input[type="checkbox"] {
      margin-top: 3px;
      accent-color: var(--accent);
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .checkbox-row label {
      font-size: 0.875rem;
      color: var(--text);
      cursor: pointer;
      user-select: none;
    }

    .btn-accept {
      display: block;
      width: 100%;
      padding: 0.75rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-accept:hover:not(:disabled) { background: var(--accent-hover); }
    .btn-accept:disabled { opacity: 0.4; cursor: not-allowed; }

    .error-msg {
      background: var(--error-bg);
      color: var(--error);
      padding: 0.75rem 1rem;
      border-radius: var(--radius);
      font-size: 0.85rem;
      margin-bottom: 1rem;
      display: none;
    }

    .version-tag {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-top: 1rem;
    }

    @media (max-width: 640px) {
      .disclaimer-box { padding: 1.25rem; }
      .disclaimer-scroll { max-height: 300px; }
    }

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

  <div class="disclaimer-box">
    <h1>Platform Usage Disclaimer</h1>
    <p class="subtitle">Please read and accept before continuing</p>

    <div class="error-msg" id="error-msg"></div>

    <div class="disclaimer-scroll">
      <h2>1. Operator Responsibility</h2>
      <p>You are solely responsible for all communications made through this platform, including phone calls, SMS, emails, and messages via messaging services (WhatsApp, Telegram, LINE, etc.) initiated by your AI agents. The platform provides communication infrastructure; how you use it is your responsibility.</p>

      <h2>2. AI Disclosure Requirements</h2>
      <p>Federal Communications Commission (FCC) rules require disclosure that calls are AI-generated. You must:</p>
      <ul>
        <li>Comply with the FCC's February 2024 ruling classifying AI-generated voice calls as "artificial" under the TCPA</li>
        <li>Ensure all AI voice calls disclose they are AI-generated at the start of the call</li>
        <li>Comply with state-level robocall and AI disclosure laws in every jurisdiction you operate</li>
        <li>Not disable the platform's built-in AI disclosure feature unless you have implemented an equivalent or stronger disclosure mechanism</li>
      </ul>

      <h2>3. Regulatory Compliance</h2>
      <p>Compliance with telecommunications and data protection regulations is YOUR responsibility. The platform provides tools to assist, but does not guarantee compliance. You are responsible for:</p>
      <ul>
        <li><strong>TCPA</strong> — obtaining prior express consent for automated calls/texts</li>
        <li><strong>FCC AI Voice Rules</strong> — disclosing AI-generated calls, maintaining accurate caller ID</li>
        <li><strong>GDPR</strong> — lawful basis for processing, data subject rights, cross-border transfers</li>
        <li><strong>CAN-SPAM / CASL</strong> — unsubscribe mechanisms, sender identification</li>
        <li><strong>State Robocall Laws</strong> — varying state requirements for automated calls</li>
        <li><strong>A2P 10DLC</strong> — campaign registration for US business messaging</li>
        <li>All other applicable local, state, national, and international regulations</li>
      </ul>

      <h2>4. Content Responsibility</h2>
      <p>You are responsible for all content your AI agents generate and transmit through this platform. This includes voice call conversations, text messages, emails, and any other communications. The platform does not review, approve, or take responsibility for AI-generated content.</p>

      <h2>5. Consent Obligations</h2>
      <p>Before contacting any individual through this platform, you must:</p>
      <ul>
        <li>Obtain and maintain proper consent as required by applicable law</li>
        <li>Maintain records of consent that can be produced upon request</li>
        <li>Honor opt-out and do-not-contact requests immediately</li>
        <li>Not contact individuals on Do Not Call registries</li>
      </ul>

      <h2>6. Indemnification</h2>
      <p>You agree to indemnify, defend, and hold harmless the platform operator (95percent.ai) and its affiliates, officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising from or related to:</p>
      <ul>
        <li>Your use of the platform</li>
        <li>Communications made through your account</li>
        <li>AI-generated content transmitted via the platform</li>
        <li>Any violation of applicable laws or regulations</li>
        <li>Any third-party claims resulting from your communications</li>
      </ul>

      <h2>7. Data Processing</h2>
      <p>For the purposes of data protection law, you are the <strong>data controller</strong> and the platform operator is the <strong>data processor</strong>. You determine the purposes and means of processing personal data through the platform. The platform processes data only as necessary to provide the communication services you configure.</p>

      <h2>8. Recording Consent</h2>
      <p>Voice call recording and transcription may require consent from all parties in many jurisdictions (two-party consent states/countries). You are responsible for obtaining recording consent where required and configuring appropriate announcements.</p>
    </div>

    <label class="checkbox-row">
      <input type="checkbox" id="accept-check" onchange="toggleBtn()">
      <label for="accept-check">I have read and understand these terms. I accept full responsibility for my use of this platform.</label>
    </label>

    <button class="btn-accept" id="accept-btn" disabled onclick="acceptDisclaimer()">Accept &amp; Continue</button>

    <div class="version-tag">Disclaimer version ${DISCLAIMER_VERSION}</div>
  </div>

  <script>
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

    function toggleBtn() {
      document.getElementById('accept-btn').disabled = !document.getElementById('accept-check').checked;
    }

    async function acceptDisclaimer() {
      var btn = document.getElementById('accept-btn');
      var errEl = document.getElementById('error-msg');
      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Processing...';

      try {
        var resp = await fetch('/auth/api/accept-disclaimer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin'
        });
        var data = await resp.json();
        if (data.success) {
          window.location.href = data.redirect || '/admin';
        } else {
          errEl.textContent = data.error || 'Failed to accept disclaimer';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Accept & Continue';
        }
      } catch (e) {
        errEl.textContent = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Accept & Continue';
      }
    }
  </script>
</body>
</html>`;
}
