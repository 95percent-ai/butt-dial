/**
 * Legal pages — Terms of Service, Acceptable Use Policy, Privacy Policy
 * Served at /legal/terms, /legal/aup, /legal/privacy
 * Same dark theme as the rest of the site.
 */

const legalStyle = `
  :root {
    --bg-body: #0f1117;
    --bg-card: #161b22;
    --border: #21262d;
    --text: #e1e4e8;
    --text-muted: #8b949e;
    --text-heading: #f0f6fc;
    --accent: #58a6ff;
    --accent-hover: #79c0ff;
    --radius: 12px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    background: var(--bg-body);
    color: var(--text);
    line-height: 1.7;
    padding: 0;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { color: var(--accent-hover); }
  .legal-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px;
    background: rgba(15, 17, 23, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .legal-nav a { color: var(--text-heading); font-weight: 700; font-size: 20px; display: flex; align-items: center; gap: 8px; }
  .legal-nav span { font-size: 24px; }
  .legal-links { display: flex; gap: 20px; }
  .legal-links a { color: var(--text-muted); font-size: 14px; font-weight: 500; }
  .legal-links a:hover { color: var(--text-heading); }
  .legal-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 100px 24px 60px;
  }
  h1 { font-size: 32px; font-weight: 700; color: var(--text-heading); margin-bottom: 8px; }
  .legal-date { color: var(--text-muted); font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 22px; font-weight: 600; color: var(--text-heading); margin-top: 40px; margin-bottom: 12px; }
  h3 { font-size: 18px; font-weight: 600; color: var(--text-heading); margin-top: 28px; margin-bottom: 8px; }
  p { margin-bottom: 14px; color: var(--text); }
  ul, ol { margin-bottom: 14px; padding-left: 24px; }
  li { margin-bottom: 6px; color: var(--text); }
  .legal-footer {
    margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border);
    text-align: center; color: var(--text-muted); font-size: 13px;
  }
  .legal-footer a { color: var(--text-muted); margin: 0 12px; }
  .scroll-top {
    position: fixed; bottom: 32px; right: 32px; z-index: 200;
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-size: 20px; display: none; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transition: opacity 0.3s, transform 0.3s;
  }
  .scroll-top:hover { transform: scale(1.1); }
  .scroll-top.visible { display: flex; }
  .back-home {
    color: var(--accent); font-size: 13px; font-weight: 500;
    margin-left: 16px; border-left: 1px solid var(--border); padding-left: 16px;
  }
  @media (max-width: 640px) {
    .legal-nav { padding: 12px 16px; }
    .legal-container { padding: 80px 16px 40px; }
    .back-home { display: none; }
    .scroll-top { bottom: 20px; right: 20px; }
  }
`;

function legalLayout(title: string, content: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Butt-Dial</title>
  <style>${legalStyle}</style>
</head>
<body>
  <nav class="legal-nav">
    <a href="/"><span>&#128222;</span> Butt-Dial</a>
    <div class="legal-links">
      <a href="/legal/terms">Terms</a>
      <a href="/legal/aup">Acceptable Use</a>
      <a href="/legal/privacy">Privacy</a>
      <a href="/" class="back-home">&larr; Back to Home</a>
    </div>
  </nav>
  <button class="scroll-top" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Scroll to top">&#8593;</button>
  <div class="legal-container">
    ${content}
    <div class="legal-footer">
      <a href="/legal/terms">Terms of Service</a>
      <a href="/legal/aup">Acceptable Use</a>
      <a href="/legal/privacy">Privacy Policy</a>
      <br><br>
      &copy; ${new Date().getFullYear()} 95percent.ai. All rights reserved.
    </div>
  </div>
  <script>
    var btn = document.querySelector('.scroll-top');
    window.addEventListener('scroll', function() {
      btn.classList.toggle('visible', window.scrollY > 300);
    });
  </script>
</body>
</html>`;
}

export function renderTermsPage(): string {
  return legalLayout("Terms of Service", /* html */ `
    <h1>Terms of Service</h1>
    <p class="legal-date">Effective: February 18, 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using the Butt-Dial communication platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service.</p>
    <p>These Terms apply to all editions of the Service: Community (self-hosted), Enterprise (self-hosted with support), and SaaS (hosted).</p>

    <h2>2. Description of Service</h2>
    <p>Butt-Dial provides communication infrastructure for AI agents, including phone calls, SMS, email, and WhatsApp messaging. The Service acts as a transport layer — it does not generate AI responses or make communication decisions. Your AI agent determines what to communicate; the Service delivers it.</p>

    <h2>3. Eligibility</h2>
    <p>You must be at least 18 years old and have the legal authority to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.</p>

    <h2>4. Account Registration</h2>
    <p>To use the Service, you must create an account with accurate information. You are responsible for:</p>
    <ul>
      <li>Maintaining the security of your credentials and API tokens</li>
      <li>All activity that occurs under your account</li>
      <li>Notifying us immediately of any unauthorized access</li>
    </ul>

    <h2>5. Acceptable Use</h2>
    <p>Your use of the Service must comply with our <a href="/legal/aup">Acceptable Use Policy</a> and all applicable laws, including telecommunications regulations in your jurisdiction.</p>

    <h2>6. Provider Credentials</h2>
    <p>You are responsible for obtaining and maintaining valid credentials for third-party providers (Twilio, Vonage, Resend, etc.). The Service does not provide telephony or messaging accounts — it integrates with providers you configure.</p>

    <h2>7. Compliance Obligations</h2>
    <p>You are responsible for compliance with all applicable telecommunications and data protection laws, including but not limited to:</p>
    <ul>
      <li><strong>TCPA</strong> (Telephone Consumer Protection Act) — prior express consent for automated calls/texts in the US</li>
      <li><strong>GDPR</strong> (General Data Protection Regulation) — data protection for EU residents</li>
      <li><strong>CAN-SPAM</strong> — requirements for commercial email in the US</li>
      <li><strong>A2P 10DLC</strong> — business messaging registration requirements in the US</li>
      <li><strong>CASL</strong> (Canadian Anti-Spam Legislation)</li>
      <li>Country-specific telecommunications regulations</li>
    </ul>
    <p>The Service provides compliance tools (DNC checking, TCPA time restrictions, consent tracking, content filtering) as aids, but you bear ultimate responsibility for legal compliance.</p>

    <h2>8. Consent Requirements</h2>
    <p>Before initiating communications with any individual, you must obtain appropriate consent as required by applicable law. The Service provides consent tracking tools, but it is your responsibility to obtain and document consent before using the Service to communicate.</p>

    <h2>9. Data and Privacy</h2>
    <p>Our handling of data is described in our <a href="/legal/privacy">Privacy Policy</a>. By using the Service, you consent to data handling as described therein.</p>

    <h2>10. Fees and Payment</h2>
    <p><strong>Community Edition:</strong> Free under the MIT license. You pay provider costs directly.</p>
    <p><strong>Enterprise Edition:</strong> Subject to a separate commercial agreement.</p>
    <p><strong>SaaS Edition:</strong> Usage-based billing as specified in your subscription agreement. Provider costs plus applicable markup.</p>

    <h2>11. Limitation of Liability</h2>
    <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES.</p>
    <p>Our total aggregate liability shall not exceed the amount you paid us in the twelve (12) months preceding the claim, or $100 for Community Edition users.</p>

    <h2>12. Indemnification</h2>
    <p>You agree to indemnify and hold harmless 95percent.ai and its affiliates from any claims, damages, or expenses arising from your use of the Service, including claims related to unsolicited communications, regulatory violations, or breach of these Terms.</p>

    <h2>13. Termination</h2>
    <p>We may suspend or terminate your access for violation of these Terms or applicable law. Upon termination, your right to use the Service ceases immediately. Data retention and deletion follows our Privacy Policy.</p>

    <h2>14. Modifications</h2>
    <p>We may update these Terms at any time. Continued use after changes constitutes acceptance. Material changes will be communicated via email or in-service notification.</p>

    <h2>15. Governing Law</h2>
    <p>These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict of law principles.</p>

    <h2>16. Contact</h2>
    <p>For questions about these Terms, contact us at <a href="mailto:legal@95percent.ai">legal@95percent.ai</a>.</p>
  `);
}

export function renderAupPage(): string {
  return legalLayout("Acceptable Use Policy", /* html */ `
    <h1>Acceptable Use Policy</h1>
    <p class="legal-date">Effective: February 18, 2026</p>

    <h2>1. Purpose</h2>
    <p>This Acceptable Use Policy ("AUP") sets out the rules for using the Butt-Dial communication platform. It applies to all users, regardless of edition.</p>

    <h2>2. Prohibited Uses</h2>
    <p>You may not use the Service to:</p>

    <h3>2.1 Unsolicited Communications</h3>
    <ul>
      <li>Send spam, unsolicited bulk messages, or automated calls without proper consent</li>
      <li>Send messages to numbers on Do Not Call lists</li>
      <li>Make robocalls without TCPA-compliant consent</li>
      <li>Send commercial emails without CAN-SPAM compliant unsubscribe mechanisms</li>
    </ul>

    <h3>2.2 Harmful Content</h3>
    <ul>
      <li>Transmit threats, harassment, hate speech, or abusive content</li>
      <li>Distribute malware, phishing attempts, or fraudulent communications</li>
      <li>Impersonate individuals, organizations, or government entities</li>
      <li>Send deceptive messages designed to mislead recipients</li>
    </ul>

    <h3>2.3 Illegal Activities</h3>
    <ul>
      <li>Violate any applicable local, state, national, or international law</li>
      <li>Infringe intellectual property rights</li>
      <li>Facilitate financial fraud, identity theft, or money laundering</li>
      <li>Circumvent telecommunications regulations</li>
    </ul>

    <h3>2.4 System Abuse</h3>
    <ul>
      <li>Attempt to bypass rate limits, spending caps, or security controls</li>
      <li>Use the Service to attack, probe, or exploit other systems</li>
      <li>Share API tokens or security credentials with unauthorized parties</li>
      <li>Reverse engineer or attempt to extract proprietary components</li>
    </ul>

    <h2>3. Content Standards</h2>
    <p>All communications sent through the Service must:</p>
    <ul>
      <li>Clearly identify the sender</li>
      <li>Include accurate caller ID / sender information</li>
      <li>Respect opt-out requests immediately</li>
      <li>Comply with applicable content regulations</li>
    </ul>

    <h2>4. Rate Limits and Fair Use</h2>
    <p>The Service enforces per-agent rate limits and spending caps. Attempts to circumvent these controls violate this AUP. Limits exist to prevent abuse and ensure fair access for all users.</p>

    <h2>5. Monitoring and Enforcement</h2>
    <p>We monitor system usage patterns (not message content) to detect abuse. We may:</p>
    <ul>
      <li>Temporarily suspend accounts suspected of violations</li>
      <li>Permanently terminate accounts for confirmed violations</li>
      <li>Report illegal activity to appropriate authorities</li>
      <li>Cooperate with law enforcement investigations</li>
    </ul>

    <h2>6. Reporting Violations</h2>
    <p>Report suspected AUP violations to <a href="mailto:abuse@95percent.ai">abuse@95percent.ai</a>.</p>
  `);
}

export function renderPrivacyPage(): string {
  return legalLayout("Privacy Policy", /* html */ `
    <h1>Privacy Policy</h1>
    <p class="legal-date">Effective: February 18, 2026</p>

    <h2>1. Introduction</h2>
    <p>This Privacy Policy describes how 95percent.ai ("we", "us") handles data when you use the Butt-Dial communication platform ("Service"). We are committed to privacy-first design.</p>

    <h2>2. Data We Collect</h2>

    <h3>2.1 Account Data</h3>
    <p>When you register: email address, organization name, and hashed password. We do not store plaintext passwords.</p>

    <h3>2.2 Communication Metadata</h3>
    <p>For each communication routed through the Service, we store routing metadata:</p>
    <ul>
      <li>Sender and recipient identifiers (phone numbers, email addresses)</li>
      <li>Timestamp, channel type, message direction</li>
      <li>Delivery status and provider response codes</li>
    </ul>

    <h3>2.3 What We Do NOT Store by Default</h3>
    <ul>
      <li>Message bodies or content</li>
      <li>Voice call audio or transcripts</li>
      <li>Media files or attachments</li>
      <li>AI agent prompts or responses</li>
    </ul>
    <p>Body storage is opt-in and encrypted when enabled. You control data retention periods.</p>

    <h3>2.4 Usage Data</h3>
    <p>Per-agent action counts, cost tracking, rate limit counters. Used for billing and abuse prevention.</p>

    <h3>2.5 Provider Credentials</h3>
    <p>Third-party API keys you configure are encrypted at rest using AES-256-GCM. We cannot read them in plaintext.</p>

    <h2>3. How We Use Data</h2>
    <ul>
      <li>Route communications to the correct recipients</li>
      <li>Enforce rate limits and spending caps</li>
      <li>Maintain audit trails for compliance</li>
      <li>Detect and prevent abuse</li>
      <li>Generate usage reports and billing</li>
    </ul>

    <h2>4. Data Sharing</h2>
    <p>We do not sell or share your data with third parties, except:</p>
    <ul>
      <li><strong>Communication providers:</strong> We transmit message content to providers (Twilio, Vonage, Resend) you configure, as necessary to deliver your communications</li>
      <li><strong>Legal requirements:</strong> When required by law, subpoena, or court order</li>
      <li><strong>Safety:</strong> To prevent imminent harm or illegal activity</li>
    </ul>

    <h2>5. Data Security</h2>
    <ul>
      <li>All API tokens hashed with SHA-256 before storage</li>
      <li>Provider credentials encrypted with AES-256-GCM</li>
      <li>Passwords hashed with PBKDF2-SHA512 (100k iterations)</li>
      <li>Tamper-evident audit log with SHA-256 hash chain</li>
      <li>No PII in application logs</li>
    </ul>

    <h2>6. Data Retention</h2>
    <p>Default retention periods:</p>
    <ul>
      <li><strong>Communication metadata:</strong> 90 days (configurable)</li>
      <li><strong>Usage logs:</strong> 365 days</li>
      <li><strong>Audit logs:</strong> Indefinite (compliance requirement)</li>
      <li><strong>Account data:</strong> Until account deletion</li>
    </ul>
    <p>Self-hosted deployments control their own retention. SaaS retention follows published schedules.</p>

    <h2>7. Your Rights</h2>

    <h3>7.1 GDPR Rights (EU Residents)</h3>
    <ul>
      <li><strong>Access:</strong> Request a copy of your data</li>
      <li><strong>Rectification:</strong> Correct inaccurate data</li>
      <li><strong>Erasure:</strong> Request deletion of your data (right to be forgotten)</li>
      <li><strong>Portability:</strong> Receive your data in a structured format</li>
      <li><strong>Objection:</strong> Object to processing of your data</li>
    </ul>
    <p>The Service includes a built-in GDPR erasure tool that deletes data across all tables by identifier.</p>

    <h3>7.2 CCPA Rights (California Residents)</h3>
    <ul>
      <li>Right to know what data we collect</li>
      <li>Right to delete your data</li>
      <li>Right to opt out of data sales (we do not sell data)</li>
      <li>Right to non-discrimination for exercising privacy rights</li>
    </ul>

    <h2>8. Self-Hosted Deployments</h2>
    <p>If you use the Community or Enterprise edition (self-hosted), your data stays on your infrastructure. We have no access to it. This Privacy Policy applies only to data we process — for self-hosted deployments, that is limited to support interactions and account data (if any).</p>

    <h2>9. Children's Privacy</h2>
    <p>The Service is not directed to children under 18. We do not knowingly collect data from minors.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy periodically. Material changes will be communicated via email or in-service notification.</p>

    <h2>11. Contact</h2>
    <p>For privacy inquiries or to exercise your rights: <a href="mailto:privacy@95percent.ai">privacy@95percent.ai</a>.</p>
    <p>Data Protection Officer: <a href="mailto:dpo@95percent.ai">dpo@95percent.ai</a></p>
  `);
}
