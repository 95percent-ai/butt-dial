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
  <title>Butt-Dial — Give Your AI Agents a Phone Number</title>
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
      max-width: 800px;
      margin-bottom: 24px;
    }
    .hero h1 .gradient {
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
    .hero p {
      font-size: clamp(16px, 2vw, 20px);
      color: var(--text-muted);
      max-width: 560px;
      margin-bottom: 40px;
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
      margin-bottom: 48px; max-width: 560px; margin-left: auto; margin-right: auto;
    }

    /* ── Feature cards ────────────────────────── */
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px 24px;
      transition: all 0.3s;
    }
    .feature-card:hover {
      border-color: var(--accent);
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.3);
    }
    .feature-icon {
      font-size: 36px; margin-bottom: 16px; display: block;
    }
    .feature-card h3 {
      font-size: 18px; font-weight: 600; color: var(--text-heading); margin-bottom: 8px;
    }
    .feature-card p {
      font-size: 14px; color: var(--text-muted); line-height: 1.5;
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

    /* ── Why section ──────────────────────────── */
    .why-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
    .why-item {
      padding: 20px;
      border-left: 3px solid var(--accent);
    }
    .why-item h3 { font-size: 16px; font-weight: 600; color: var(--text-heading); margin-bottom: 6px; }
    .why-item p { font-size: 14px; color: var(--text-muted); }

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
    .open-source p { color: var(--text-muted); margin-bottom: 24px; }
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
    }
  </style>
</head>
<body>

  <!-- Nav -->
  <nav class="nav">
    <div class="nav-logo"><span>&#128222;</span> Butt-Dial</div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#how-it-works">How It Works</a>
      <a href="https://github.com/95percent-ai/butt-dial/wiki" target="_blank">Docs</a>
      <a href="/auth/login" class="btn-nav">Get Started</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <h1>Give Your AI Agents a <span class="gradient">Phone Number</span></h1>
    <p>Calls, SMS, email, and WhatsApp for your AI agents. One MCP server, all channels. Self-hosted and open source.</p>
    <div class="hero-cta">
      <a href="/auth/login" class="btn-primary">Get Started Free</a>
      <a href="https://github.com/95percent-ai/butt-dial" target="_blank" class="btn-secondary">View on GitHub</a>
    </div>
  </section>

  <!-- Features -->
  <section id="features">
    <h2 class="section-title">Everything Your Agents Need</h2>
    <p class="section-subtitle">Four communication channels, one unified API. Your AI agents can talk to the world.</p>
    <div class="features">
      <div class="feature-card">
        <span class="feature-icon">&#128222;</span>
        <h3>Phone Calls</h3>
        <p>Real-time AI voice conversations. Your agent answers calls, makes outbound calls, and transfers to humans when needed.</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">&#128172;</span>
        <h3>SMS</h3>
        <p>Send and receive text messages. Two-way conversations with full message history and threading.</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">&#9993;</span>
        <h3>Email</h3>
        <p>Transactional and conversational email. HTML templates, attachments, and inbound webhook processing.</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">&#128279;</span>
        <h3>WhatsApp</h3>
        <p>Rich messaging via WhatsApp Business. Templates, media, and real-time notifications.</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
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
        <h3>Connect API Keys</h3>
        <p>Add your Twilio, Resend, or other provider credentials in the admin panel.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h3>Start Communicating</h3>
        <p>Your AI agent connects via MCP and can immediately make calls, send messages, and more.</p>
      </div>
    </div>
  </section>

  <!-- Why -->
  <section>
    <h2 class="section-title">Why Butt-Dial?</h2>
    <p class="section-subtitle">Built for developers who want full control over their AI communication stack.</p>
    <div class="why-grid">
      <div class="why-item">
        <h3>Self-Hosted</h3>
        <p>Your data, your servers, your rules. Deploy anywhere — cloud, VPS, or on-prem.</p>
      </div>
      <div class="why-item">
        <h3>Zero Vendor Lock-in</h3>
        <p>Swap Twilio for Vonage, ElevenLabs for OpenAI TTS. Pluggable provider architecture.</p>
      </div>
      <div class="why-item">
        <h3>MCP-Native</h3>
        <p>Built on the Model Context Protocol. Works with Claude, GPT, and any MCP-compatible agent.</p>
      </div>
      <div class="why-item">
        <h3>Multi-Tenant</h3>
        <p>Organization isolation, per-agent billing, rate limiting, and compliance built in.</p>
      </div>
    </div>
  </section>

  <!-- Open Source -->
  <section>
    <div class="open-source">
      <h2>Open Source</h2>
      <p>Butt-Dial is free and open source. Star us on GitHub, contribute, or read the docs.</p>
      <div class="open-source-links">
        <a href="https://github.com/95percent-ai/butt-dial" target="_blank" class="btn-primary">GitHub</a>
        <a href="https://github.com/95percent-ai/butt-dial/wiki" target="_blank" class="btn-secondary">Wiki &amp; Docs</a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="footer-links">
      <a href="https://github.com/95percent-ai/butt-dial" target="_blank">GitHub</a>
      <a href="https://github.com/95percent-ai/butt-dial/wiki" target="_blank">Wiki</a>
      <a href="/admin">Admin</a>
      <a href="/auth/login">Login</a>
    </div>
    <p class="footer-credit">Powered by <a href="https://95percent.ai" target="_blank">95percent.ai</a></p>
  </footer>

</body>
</html>`;
}
