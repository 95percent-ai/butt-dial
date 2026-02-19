/**
 * Landing page — marketing page at GET /
 * Inline CSS/JS, dark theme, same CSS variables as admin.
 */

export function renderLandingPage(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Butt-Dial — Communication Infrastructure for AI Agents</title>
  <style>
    :root {
      --bg-body: #0f1117;
      --bg-card: #161b22;
      --border: #21262d;
      --text: #e1e4e8;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --success: #3fb950;
      --warning: #d29922;
      --radius: 12px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg-body);
      color: var(--text);
      line-height: 1.6;
      overflow-x: hidden;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    /* ── Nav ─────────────────────────────────── */
    .nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 32px;
      background: rgba(15, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .nav-logo {
      font-size: 20px; font-weight: 700; color: var(--text-heading);
      display: flex; align-items: center; gap: 8px;
    }
    .nav-logo span { font-size: 24px; }
    .nav-links { display: flex; gap: 24px; align-items: center; }
    .nav-links a { color: var(--text-muted); font-size: 14px; font-weight: 500; }
    .nav-links a:hover { color: var(--text-heading); }
    .btn-nav {
      padding: 8px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;
      background: var(--accent); color: #fff; border: none; cursor: pointer;
      transition: background 0.2s;
    }
    .btn-nav:hover { background: var(--accent-hover); color: #fff; }

    /* ── Hero ─────────────────────────────────── */
    .hero {
      min-height: 100vh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center;
      padding: 120px 24px 80px;
      position: relative;
    }
    .hero::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(ellipse 80% 60% at 50% 30%, rgba(88,166,255,0.12) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero h1 {
      font-size: clamp(36px, 6vw, 72px);
      font-weight: 800;
      color: var(--text-heading);
      line-height: 1.1;
      max-width: 900px;
      margin-bottom: 24px;
    }
    .hero h1 .gradient {
      white-space: nowrap;
      background: linear-gradient(135deg, #58a6ff 0%, #3fb950 50%, #d29922 100%);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradientShift 4s ease-in-out infinite;
    }
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .hero p.hero-sub {
      font-size: clamp(16px, 2vw, 20px);
      color: var(--text-muted);
      max-width: 680px;
      margin-bottom: 40px;
      line-height: 1.7;
    }
    .hero-cta {
      display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
    }
    .btn-primary {
      padding: 14px 36px; border-radius: 10px; font-weight: 700; font-size: 16px;
      background: var(--accent); color: #fff; border: none; cursor: pointer;
      transition: all 0.2s; display: inline-block;
    }
    .btn-primary:hover { background: var(--accent-hover); color: #fff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(88,166,255,0.3); }
    .btn-secondary {
      padding: 14px 36px; border-radius: 10px; font-weight: 600; font-size: 16px;
      background: transparent; color: var(--text); border: 1px solid var(--border); cursor: pointer;
      transition: all 0.2s; display: inline-block;
    }
    .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

    /* ── Section ──────────────────────────────── */
    section { padding: 80px 24px; max-width: 1100px; margin: 0 auto; }
    .section-title {
      font-size: 32px; font-weight: 700; color: var(--text-heading);
      text-align: center; margin-bottom: 12px;
    }
    .section-subtitle {
      font-size: 16px; color: var(--text-muted); text-align: center;
      margin-bottom: 48px; max-width: 620px; margin-left: auto; margin-right: auto;
    }

    /* ── Problem cards ────────────────────────── */
    .problem-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .problem-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--warning);
      border-radius: var(--radius);
      padding: 24px;
      transition: all 0.3s;
    }
    .problem-card:hover {
      border-color: var(--warning);
      border-left-color: var(--warning);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .problem-card h3 {
      font-size: 16px; font-weight: 600; color: var(--text-heading); margin-bottom: 6px;
    }
    .problem-card p {
      font-size: 14px; color: var(--text-muted); line-height: 1.5;
    }

    /* ── Architecture diagram ─────────────────── */
    .arch-diagram {
      display: flex; align-items: center; justify-content: center;
      gap: 0; flex-wrap: nowrap;
      margin-bottom: 48px;
    }
    .arch-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 28px;
      text-align: center;
      min-width: 140px;
      flex: 1 1 0;
      max-width: 240px;
    }
    .arch-box.arch-highlight {
      border-color: var(--accent);
      box-shadow: 0 0 24px rgba(88,166,255,0.15);
    }
    .arch-box .arch-icon { font-size: 28px; display: block; margin-bottom: 8px; }
    .arch-box .arch-label { font-size: 14px; font-weight: 600; color: var(--text-heading); }
    .arch-box .arch-desc { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    .arch-arrow {
      font-size: 24px; color: var(--text-muted); padding: 0 12px;
      display: flex; align-items: center;
    }
    .arch-points { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
    .arch-point h3 { font-size: 16px; font-weight: 600; color: var(--text-heading); margin-bottom: 6px; }
    .arch-point p { font-size: 14px; color: var(--text-muted); }

    /* ── Feature detail cards ─────────────────── */
    .feature-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
    .feature-detail-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px 24px;
      transition: all 0.3s;
    }
    .feature-detail-card:hover {
      border-color: var(--accent);
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.3);
    }
    .feature-detail-card .feature-icon {
      font-size: 36px; margin-bottom: 16px; display: block;
    }
    .feature-detail-card h3 {
      font-size: 18px; font-weight: 600; color: var(--text-heading); margin-bottom: 8px;
    }
    .feature-detail-card .feature-desc {
      font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;
    }
    .feature-detail-card ul {
      list-style: none; padding: 0;
    }
    .feature-detail-card ul li {
      font-size: 13px; color: var(--text-muted); padding: 4px 0;
      padding-left: 20px; position: relative;
    }
    .feature-detail-card ul li::before {
      content: '\\2713';
      position: absolute; left: 0; color: var(--success); font-weight: 700;
    }

    /* ── Security / Compliance two-column ──────── */
    .sec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .sec-column {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
    }
    .sec-column h3 {
      font-size: 18px; font-weight: 600; color: var(--text-heading); margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .check-list { list-style: none; padding: 0; }
    .check-list li {
      font-size: 14px; color: var(--text-muted); padding: 6px 0;
      padding-left: 24px; position: relative; line-height: 1.5;
    }
    .check-list li::before {
      content: '\\2713';
      position: absolute; left: 0; color: var(--success); font-weight: 700;
    }

    /* ── Steps ────────────────────────────────── */
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 32px; }
    .step {
      text-align: center; padding: 24px;
    }
    .step-number {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--accent); color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 700; margin-bottom: 16px;
    }
    .step h3 {
      font-size: 18px; font-weight: 600; color: var(--text-heading); margin-bottom: 8px;
    }
    .step p { font-size: 14px; color: var(--text-muted); }

    /* ── Compact row (observability) ──────────── */
    .compact-row {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;
    }
    .compact-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px 20px;
      text-align: center;
      transition: all 0.3s;
    }
    .compact-item:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .compact-item .compact-icon { font-size: 28px; display: block; margin-bottom: 10px; }
    .compact-item h3 { font-size: 15px; font-weight: 600; color: var(--text-heading); margin-bottom: 4px; }
    .compact-item p { font-size: 13px; color: var(--text-muted); }

    /* ── Open source ─────────────────────────── */
    .open-source {
      text-align: center;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 48px 24px;
      max-width: 700px;
      margin: 0 auto;
    }
    .open-source h2 { font-size: 28px; color: var(--text-heading); margin-bottom: 12px; }
    .open-source p { color: var(--text-muted); margin-bottom: 24px; max-width: 520px; margin-left: auto; margin-right: auto; }
    .open-source-links { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }

    /* ── Footer ───────────────────────────────── */
    footer {
      padding: 40px 24px;
      border-top: 1px solid var(--border);
      text-align: center;
    }
    .footer-links { display: flex; gap: 24px; justify-content: center; margin-bottom: 16px; flex-wrap: wrap; }
    .footer-links a { color: var(--text-muted); font-size: 14px; }
    .footer-credit { color: var(--text-muted); font-size: 13px; }

    /* ── Mobile ───────────────────────────────── */
    @media (max-width: 640px) {
      .nav { padding: 12px 16px; }
      .nav-links a:not(.btn-nav) { display: none; }
      section { padding: 48px 16px; }
      .sec-grid { grid-template-columns: 1fr; }
      .arch-diagram { flex-direction: column; flex-wrap: nowrap; }
      .arch-box { max-width: 100%; min-width: auto; }
      .arch-arrow { transform: rotate(90deg); padding: 8px 0; }
    }
  </style>
</head>
<body>

  <!-- 1. Nav -->
  <nav class="nav">
    <div class="nav-logo"><span>&#128222;</span> Butt-Dial</div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#architecture">Architecture</a>
      <a href="#security">Security</a>
      <a href="/docs">Docs</a>
      <a href="/auth/login" class="btn-nav">Get Started</a>
    </div>
  </nav>

  <!-- 2. Hero -->
  <section class="hero">
    <h1>Open Communication <span class="gradient">Infrastructure</span> for AI Agents</h1>
    <p class="hero-sub">Phone calls, SMS, email, WhatsApp. A production-grade communication layer with pluggable providers, real-time translation, compliance, billing, and zero vendor lock-in. Self-hosted. Open source.</p>
    <div class="hero-cta">
      <a href="/auth/login" class="btn-primary">Get Started Free</a>
      <a href="https://github.com/elrad/butt-dial-mcp" target="_blank" class="btn-secondary">View on GitHub</a>
    </div>
  </section>

  <!-- 3. The Problem -->
  <section>
    <h2 class="section-title">Anyone Can Make an API Call</h2>
    <p class="section-subtitle">But production AI communication needs more than a wrapper.</p>
    <div class="problem-grid">
      <div class="problem-card">
        <h3>Vendor Lock-in</h3>
        <p>Hard-coded to one provider. Switching means rewriting your entire integration from scratch.</p>
      </div>
      <div class="problem-card">
        <h3>No Fallback</h3>
        <p>Agent disconnects mid-call and the caller hears silence. No voicemail, no transfer, no recovery.</p>
      </div>
      <div class="problem-card">
        <h3>No Compliance</h3>
        <p>TCPA time-of-day rules, DNC lists, CAN-SPAM, GDPR consent &mdash; gaps that become lawsuits.</p>
      </div>
      <div class="problem-card">
        <h3>No Billing</h3>
        <p>No per-agent cost tracking, no spending caps, no way to monetize when you deploy for clients.</p>
      </div>
      <div class="problem-card">
        <h3>No Security</h3>
        <p>Unsigned webhooks, no rate limiting, no replay prevention. Open doors for abuse.</p>
      </div>
      <div class="problem-card">
        <h3>Single Language</h3>
        <p>Caller speaks Spanish, your agent only works in English. No translation, no reach.</p>
      </div>
    </div>
  </section>

  <!-- 4. Architecture Overview -->
  <section id="architecture">
    <h2 class="section-title">Infrastructure, Not Intelligence</h2>
    <p class="section-subtitle">Your AI agent is the brain. Butt-Dial is the telephone system.</p>

    <div class="arch-diagram">
      <div class="arch-box">
        <span class="arch-icon">&#129302;</span>
        <span class="arch-label">AI Agent</span>
        <span class="arch-desc">Your LLM decides what to say</span>
      </div>
      <div class="arch-arrow">&#8596;</div>
      <div class="arch-box arch-highlight">
        <span class="arch-icon">&#128222;</span>
        <span class="arch-label">Butt-Dial Server</span>
        <span class="arch-desc">MCP communication layer</span>
      </div>
      <div class="arch-arrow">&#8596;</div>
      <div class="arch-box">
        <span class="arch-icon">&#128268;</span>
        <span class="arch-label">Providers</span>
        <span class="arch-desc">Twilio, Vonage, Resend&hellip;</span>
      </div>
      <div class="arch-arrow">&#8596;</div>
      <div class="arch-box">
        <span class="arch-icon">&#128100;</span>
        <span class="arch-label">Human</span>
        <span class="arch-desc">Calls, texts, emails</span>
      </div>
    </div>

    <div class="arch-points">
      <div class="arch-point">
        <h3>Your agent decides what to say</h3>
        <p>The server never generates AI responses. It handles transport, compliance, and delivery. Your agent stays in control.</p>
      </div>
      <div class="arch-point">
        <h3>Swap providers at config time</h3>
        <p>Twilio, Vonage, Resend, ElevenLabs, OpenAI TTS &mdash; all pluggable. Switch in config, not in code.</p>
      </div>
      <div class="arch-point">
        <h3>Provision in seconds</h3>
        <p>One API call, under 10 seconds. Phone number, SMS, email, WhatsApp &mdash; all channels ready.</p>
      </div>
    </div>
  </section>

  <!-- 5. Killer Features -->
  <section id="features">
    <h2 class="section-title">What Makes It Different</h2>
    <p class="section-subtitle">Features that take months to build. Included.</p>
    <div class="feature-detail-grid">

      <div class="feature-detail-card">
        <span class="feature-icon">&#128374;</span>
        <h3>Frontdesk: AI Receptionist</h3>
        <p class="feature-desc">An always-on fallback for when your agent goes offline. Activate it when you want it &mdash; requires an LLM key (Anthropic). Optional, your choice.</p>
        <ul>
          <li>Agent offline? Frontdesk takes the call</li>
          <li>Collects voicemail with callback preferences</li>
          <li>Can send SMS, email, or transfer mid-call</li>
          <li>Dispatches everything when agent reconnects</li>
        </ul>
      </div>

      <div class="feature-detail-card">
        <span class="feature-icon">&#127760;</span>
        <h3>Real-Time Translation</h3>
        <p class="feature-desc">Per-agent language settings. Caller speaks one language, agent works in another. Translated in both directions.</p>
        <ul>
          <li>Works on voice, SMS, WhatsApp, and email</li>
          <li>Available for Human to human communication</li>
          <li>Set per agent, not per account</li>
          <li>No extra API &mdash; built into the pipeline</li>
        </ul>
      </div>

      <div class="feature-detail-card">
        <span class="feature-icon">&#9889;</span>
        <h3>Voice Tool Use</h3>
        <p class="feature-desc">Your AI agent takes real actions during a live phone call. Not after &mdash; during.</p>
        <ul>
          <li>Send an SMS while on a call</li>
          <li>Fire off a confirmation email</li>
          <li>Transfer to a human when needed</li>
          <li>Trigger a webhook or any MCP tool</li>
        </ul>
      </div>

      <div class="feature-detail-card">
        <span class="feature-icon">&#128256;</span>
        <h3>Zero Vendor Lock-in</h3>
        <p class="feature-desc">Pluggable provider architecture. Swap telephony, email, TTS, or STT providers without touching application code.</p>
        <ul>
          <li>Twilio &#8596; Vonage for calls/SMS</li>
          <li>Resend &#8596; SendGrid for email</li>
          <li>ElevenLabs &#8596; OpenAI for TTS</li>
          <li>Change in config, deploy, done</li>
        </ul>
      </div>

      <div class="feature-detail-card">
        <span class="feature-icon">&#128274;</span>
        <h3>Privacy First</h3>
        <p class="feature-desc">Self-hosted by design. Message content passes through &mdash; never stored. Credentials encrypted at rest. Logs redacted automatically.</p>
        <ul>
          <li>Self-hosted &mdash; data never leaves your server</li>
          <li>Message content passes through, never stored</li>
          <li>Credentials encrypted with AES-256</li>
          <li>Phone numbers and emails redacted in logs</li>
        </ul>
      </div>

      <div class="feature-detail-card">
        <span class="feature-icon">&#128176;</span>
        <h3>Built-in Billing Engine</h3>
        <p class="feature-desc">Per-agent cost tracking with tiered plans. Deploy for clients and monetize from day one.</p>
        <ul>
          <li>4 tiers: Free, Starter, Pro, Enterprise</li>
          <li>Offshore communication at local prices</li>
          <li>Per-agent and per-org spending caps</li>
          <li>Usage dashboards with cost breakdown</li>
        </ul>
      </div>

    </div>
  </section>

  <!-- 6. Security & Compliance -->
  <section id="security">
    <h2 class="section-title">Production Security. Zero Dependencies.</h2>
    <p class="section-subtitle">No helmet. No cors package. Every security layer built from scratch.</p>
    <div class="sec-grid">
      <div class="sec-column">
        <h3>&#128274; Security</h3>
        <ul class="check-list">
          <li>Bearer token authentication on all admin routes</li>
          <li>Webhook signature verification (Twilio, Vonage)</li>
          <li>Replay attack prevention with nonce cache</li>
          <li>AES-256-GCM encryption for sensitive data</li>
          <li>Brute-force lockout (10 failures &#8594; 15-min ban)</li>
          <li>Anomaly detection running every 60 seconds</li>
          <li>Per-IP and per-route rate limiting</li>
          <li>Input sanitization on all endpoints</li>
          <li>IP-based admin access filtering</li>
        </ul>
      </div>
      <div class="sec-column">
        <h3>&#128220; Compliance</h3>
        <ul class="check-list">
          <li>TCPA time-of-day calling restrictions</li>
          <li>Do Not Call (DNC) list enforcement</li>
          <li>GDPR consent tracking and erasure</li>
          <li>CAN-SPAM compliant email handling</li>
          <li>Content filtering and guardrails</li>
          <li>Recording consent management</li>
          <li>SHA-256 tamper-proof audit trail</li>
          <li>Per-agent compliance configuration</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- 7. How It Works -->
  <section id="how-it-works">
    <h2 class="section-title">Up and Running in Minutes</h2>
    <p class="section-subtitle">Three steps from zero to a fully connected AI agent.</p>
    <div class="steps">
      <div class="step">
        <div class="step-number">1</div>
        <h3>Register</h3>
        <p>Create an account and get your organization token. No credit card required.</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h3>Configure Providers</h3>
        <p>Add your Twilio, Vonage, or Resend credentials in the admin panel. Test with one click.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h3>Connect Your Agent</h3>
        <p>Point Claude Desktop, Cursor, or any MCP client at the server. Your agent can communicate instantly.</p>
      </div>
    </div>
  </section>

  <!-- 8. Observability -->
  <section>
    <h2 class="section-title">Built to Operate</h2>
    <p class="section-subtitle">Everything you need to monitor, debug, and run in production.</p>
    <div class="compact-row">
      <div class="compact-item">
        <span class="compact-icon">&#128202;</span>
        <h3>Admin Dashboard</h3>
        <p>Real-time view of agents, calls, messages, and system health.</p>
      </div>
      <div class="compact-item">
        <span class="compact-icon">&#128200;</span>
        <h3>Prometheus Metrics</h3>
        <p>Export to Grafana, Datadog, or any metrics backend.</p>
      </div>
      <div class="compact-item">
        <span class="compact-icon">&#128203;</span>
        <h3>Structured Logging</h3>
        <p>JSON logs with correlation IDs across every request.</p>
      </div>
      <div class="compact-item">
        <span class="compact-icon">&#128260;</span>
        <h3>Demo Mode</h3>
        <p>Test everything without live API calls. Safe for development.</p>
      </div>
    </div>
  </section>

  <!-- 9. Open Source CTA -->
  <section>
    <div class="open-source">
      <h2>Self-Hosted. Open Source. Your Data.</h2>
      <p>Deploy anywhere. No usage fees, no vendor dashboards, no data leaving your network.</p>
      <div class="open-source-links">
        <a href="https://github.com/elrad/butt-dial-mcp" target="_blank" class="btn-primary">View on GitHub</a>
        <a href="/docs" class="btn-secondary">Read the Docs</a>
      </div>
    </div>
  </section>

  <!-- 10. Footer -->
  <footer>
    <div class="footer-links">
      <a href="https://github.com/elrad/butt-dial-mcp" target="_blank">GitHub</a>
      <a href="/docs">Docs</a>
      <a href="/admin">Admin</a>
      <a href="/auth/login">Login</a>
      <a href="/legal/terms">Terms</a>
      <a href="/legal/privacy">Privacy</a>
      <a href="/legal/aup">Acceptable Use</a>
    </div>
    <p class="footer-credit">Powered by <a href="https://95percent.ai" target="_blank">95percent.ai</a></p>
  </footer>

</body>
</html>`;
}
