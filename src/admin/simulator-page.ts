/**
 * Simulator Tab — renders the Chat / Walkthrough / Playground UI.
 * Returns HTML string to embed inside the unified admin page.
 * All CSS and JS are inline (same pattern as unified-admin.ts).
 */

export function renderSimulatorTab(): string {
  return /* html */ `
<style>
  /* ── Simulator Layout ─────────────────────────────── */
  .sim-modes {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .sim-mode-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    transition: all 0.15s;
    font-family: var(--font);
  }
  .sim-mode-btn:hover {
    border-color: var(--text-muted);
    color: var(--text);
  }
  .sim-mode-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .sim-panel { display: none; }
  .sim-panel.active { display: block; }

  /* ── Chat Mode ────────────────────────────────────── */
  .chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 200px);
    min-height: 400px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .chat-msg {
    max-width: 80%;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    font-size: 0.875rem;
    line-height: 1.5;
    word-wrap: break-word;
  }
  .chat-msg.user {
    align-self: flex-end;
    background: var(--accent);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .chat-msg.assistant {
    align-self: flex-start;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    border-bottom-left-radius: 4px;
  }
  .chat-msg.system {
    align-self: center;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-style: italic;
  }
  .chat-tool-card {
    background: var(--bg-body);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }
  .chat-tool-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  }
  .chat-tool-name {
    font-weight: 700;
    color: var(--accent);
    font-family: "SFMono-Regular", Consolas, monospace;
  }
  .chat-tool-duration {
    color: var(--text-muted);
    font-size: 0.7rem;
  }
  .chat-tool-body {
    display: none;
    margin-top: 0.5rem;
  }
  .chat-tool-body.open { display: block; }
  .chat-tool-body pre {
    background: var(--bg-body);
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.75rem;
    color: var(--text);
    margin: 0.3rem 0;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .chat-tool-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 0.4rem;
  }
  .chat-input-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-input);
  }
  .chat-input-bar input {
    flex: 1;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.875rem;
    font-family: var(--font);
    outline: none;
  }
  .chat-input-bar input:focus { border-color: var(--border-focus); }
  .chat-input-bar button {
    padding: 0.6rem 1.25rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: var(--font);
  }
  .chat-input-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
  .chat-chips {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-input);
    flex-wrap: wrap;
  }
  .chat-chip {
    padding: 0.3rem 0.6rem;
    background: rgba(88, 166, 255, 0.1);
    border: 1px solid rgba(88, 166, 255, 0.3);
    border-radius: 999px;
    color: var(--accent);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font);
  }
  .chat-chip:hover {
    background: rgba(88, 166, 255, 0.2);
    border-color: var(--accent);
  }
  .chat-typing {
    color: var(--text-muted);
    font-size: 0.8rem;
    font-style: italic;
    padding: 0.3rem 0;
  }
  .chat-no-llm {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--text-muted);
  }
  .chat-no-llm h3 { color: var(--text-heading); margin-bottom: 0.5rem; }
  .chat-header-bar {
    display: flex;
    justify-content: flex-end;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  /* ── Walkthrough Mode ─────────────────────────────── */
  .wt-scenarios {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }
  .wt-scenario-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .wt-scenario-card:hover { border-color: var(--accent); }
  .wt-scenario-card h3 {
    font-size: 0.95rem;
    color: var(--text-heading);
    margin-bottom: 0.4rem;
  }
  .wt-scenario-card p {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }
  .wt-tools-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .wt-tool-badge {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: rgba(88, 166, 255, 0.1);
    color: var(--accent);
    font-family: "SFMono-Regular", Consolas, monospace;
  }
  .wt-step-view {
    display: none;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
  }
  .wt-step-view.active { display: block; }
  .wt-step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .wt-step-header h3 { color: var(--text-heading); font-size: 1rem; }
  .wt-step-progress {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .wt-step-description {
    color: var(--text);
    font-size: 0.85rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  .wt-step-params { margin-bottom: 1rem; }
  .wt-step-result {
    display: none;
    margin-top: 1rem;
  }
  .wt-step-result.visible { display: block; }
  .wt-step-result pre {
    background: var(--bg-body);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    font-size: 0.8rem;
    color: var(--text);
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .wt-step-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  /* ── Playground Mode ──────────────────────────────── */
  .pg-layout {
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: 1rem;
    min-height: calc(100vh - 200px);
  }
  @media (max-width: 900px) {
    .pg-layout { grid-template-columns: 1fr; }
  }
  .pg-panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    overflow-y: auto;
    max-height: calc(100vh - 200px);
  }
  .pg-panel h3 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-heading);
    margin-bottom: 1rem;
  }
  .pg-tool-select {
    width: 100%;
    padding: 0.55rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.875rem;
    cursor: pointer;
    margin-bottom: 1rem;
    font-family: var(--font);
    outline: none;
  }
  .pg-tool-select:focus { border-color: var(--border-focus); }
  .pg-tool-desc {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin-bottom: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .pg-form-field { margin-bottom: 0.6rem; }
  .pg-form-field label {
    display: block;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 0.2rem;
  }
  .pg-form-field label .pg-required {
    color: var(--error);
    margin-left: 2px;
  }
  .pg-form-field input,
  .pg-form-field select,
  .pg-form-field textarea {
    width: 100%;
    padding: 0.5rem 0.65rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.825rem;
    font-family: var(--font);
    outline: none;
    transition: border-color 0.2s;
  }
  .pg-form-field input:focus,
  .pg-form-field select:focus,
  .pg-form-field textarea:focus {
    border-color: var(--border-focus);
  }
  .pg-form-field textarea {
    min-height: 60px;
    resize: vertical;
  }
  .pg-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .pg-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .pg-result-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .pg-result pre {
    background: var(--bg-body);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    font-size: 0.8rem;
    color: var(--text);
    overflow-x: auto;
    max-height: calc(100vh - 340px);
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .pg-history {
    margin-top: 1.5rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  .pg-history h4 {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .pg-history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 1px solid rgba(33, 38, 45, 0.5);
  }
  .pg-history-item:hover { color: var(--text); }
  .pg-history-item .pg-hist-tool {
    color: var(--accent);
    font-family: "SFMono-Regular", Consolas, monospace;
  }
  .pg-json-key { color: #79c0ff; }
  .pg-json-string { color: #a5d6ff; }
  .pg-json-number { color: #d2a8ff; }
  .pg-json-bool { color: #ff7b72; }
  .pg-json-null { color: #8b949e; }
</style>

<!-- Mode Toggle -->
<div class="sim-modes">
  <button class="sim-mode-btn active" data-mode="chat" onclick="simSwitchMode('chat')">Chat</button>
  <button class="sim-mode-btn" data-mode="walkthrough" onclick="simSwitchMode('walkthrough')">Walkthrough</button>
  <button class="sim-mode-btn" data-mode="playground" onclick="simSwitchMode('playground')">Playground</button>
</div>

<!-- ══ Chat Panel ═══════════════════════════════════ -->
<div id="sim-chat" class="sim-panel active">
  <div id="chat-no-llm" class="chat-no-llm" style="display:none;">
    <h3>LLM Not Configured</h3>
    <p>Chat mode requires an Anthropic API key. Set <code>ANTHROPIC_API_KEY</code> in Settings, or use Playground mode to execute tools manually.</p>
    <button class="btn btn-primary" style="margin-top:1rem;" onclick="simSwitchMode('playground')">Go to Playground</button>
  </div>
  <div id="chat-ui" class="chat-container">
    <div class="chat-header-bar">
      <button class="btn btn-sm btn-secondary" onclick="simChatClear()">Clear</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-msg system">Start a conversation. The AI assistant will use MCP tools to help you.</div>
    </div>
    <div class="chat-chips" id="chat-chips">
      <span class="chat-chip" onclick="simChatSend('Send an SMS to +15551234567 saying hello')">Send an SMS</span>
      <span class="chat-chip" onclick="simChatSend('Onboard a new agent called Acme Corp')">Onboard agent</span>
      <span class="chat-chip" onclick="simChatSend('Check the server health')">Health check</span>
      <span class="chat-chip" onclick="simChatSend('Show billing summary for agent-001')">Check billing</span>
      <span class="chat-chip" onclick="simChatSend('Send an OTP code to +15551234567')">Verify contact</span>
    </div>
    <div class="chat-input-bar">
      <input type="text" id="chat-input" placeholder="Ask the assistant to do something..." onkeydown="if(event.key==='Enter')simChatSendInput()">
      <button id="chat-send-btn" onclick="simChatSendInput()">Send</button>
    </div>
  </div>
</div>

<!-- ══ Walkthrough Panel ════════════════════════════ -->
<div id="sim-walkthrough" class="sim-panel">
  <div id="wt-scenarios" class="wt-scenarios"></div>
  <div id="wt-step-view" class="wt-step-view"></div>
</div>

<!-- ══ Playground Panel ═════════════════════════════ -->
<div id="sim-playground" class="sim-panel">
  <div class="pg-layout">
    <div class="pg-panel" id="pg-form-panel">
      <h3>Execute Tool</h3>
      <select class="pg-tool-select" id="pg-tool-select" onchange="pgToolChanged()">
        <option value="">Select a tool...</option>
      </select>
      <div id="pg-tool-desc" class="pg-tool-desc" style="display:none;"></div>
      <div id="pg-form-fields"></div>
      <div class="pg-actions">
        <button class="btn btn-primary" id="pg-execute-btn" onclick="pgExecute()" disabled>Execute</button>
        <button class="btn btn-secondary" id="pg-copy-btn" onclick="pgCopyArgs()" style="display:none;">Copy Args</button>
      </div>
    </div>
    <div class="pg-panel">
      <div class="pg-result-header">
        <h3>Response</h3>
        <div class="pg-result-meta">
          <span id="pg-result-tool">—</span>
          <span id="pg-result-time">—</span>
          <span id="pg-result-status">—</span>
        </div>
      </div>
      <pre id="pg-result">Select a tool and click Execute to see results here.</pre>
      <div class="pg-history" id="pg-history">
        <h4>Recent Executions</h4>
        <div id="pg-history-list"></div>
      </div>
    </div>
  </div>
</div>

<script>
/* ══════════════════════════════════════════════════════
   Simulator JavaScript
   ══════════════════════════════════════════════════════ */

/* ── State ──────────────────────────────────────────── */
let simTools = [];
let simCategories = {};
let simHasLlm = false;
let simChatHistory = [];
let simChatBusy = false;
let pgExecutionHistory = [];

/* ── Init ───────────────────────────────────────────── */
async function initSimulator() {
  try {
    const res = await apiFetch('/admin/api/simulator/tools');
    const data = await res.json();
    simTools = data.tools || [];
    simCategories = data.categories || {};
    simHasLlm = data.hasLlm || false;

    // Chat: show/hide LLM notice
    if (!simHasLlm) {
      document.getElementById('chat-no-llm').style.display = 'block';
      document.getElementById('chat-ui').style.display = 'none';
    }

    // Populate playground dropdown
    pgPopulateTools();

    // Populate walkthrough scenarios
    wtRenderScenarios();
  } catch (err) {
    console.error('Simulator init error:', err);
  }
}

/* ── Mode Switching ─────────────────────────────────── */
function simSwitchMode(mode) {
  document.querySelectorAll('.sim-mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sim-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-mode="' + mode + '"]').classList.add('active');
  document.getElementById('sim-' + mode).classList.add('active');
}

/* ══ Chat Mode ══════════════════════════════════════ */
function simChatSend(text) {
  if (!text || simChatBusy) return;
  simChatBusy = true;
  document.getElementById('chat-send-btn').disabled = true;

  // Add user message
  simAddChatMsg('user', text);
  simChatHistory.push({ role: 'user', content: text });

  // Show typing indicator
  const typingId = 'typing-' + Date.now();
  simAddChatTyping(typingId);

  apiFetch('/admin/api/simulator/chat', {
    method: 'POST',
    body: JSON.stringify({ message: text, history: simChatHistory.slice(0, -1) })
  })
  .then(r => r.json())
  .then(data => {
    simRemoveTyping(typingId);
    if (data.error) {
      simAddChatMsg('system', 'Error: ' + data.error);
    } else {
      // Build assistant message with tool cards
      let html = simEscHtml(data.reply || '');

      if (data.toolCalls && data.toolCalls.length > 0) {
        for (const tc of data.toolCalls) {
          const tcId = 'tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          html += '<div class="chat-tool-card">' +
            '<div class="chat-tool-header" onclick="document.getElementById(\\'' + tcId + '\\').classList.toggle(\\'open\\')">' +
            '<span class="chat-tool-name">' + simEscHtml(tc.name) + '</span>' +
            '<span class="chat-tool-duration">' + tc.durationMs + 'ms' + (tc.isError ? ' &middot; error' : '') + '</span>' +
            '</div>' +
            '<div class="chat-tool-body" id="' + tcId + '">' +
            '<div class="chat-tool-label">Input</div>' +
            '<pre>' + simEscHtml(JSON.stringify(tc.args, null, 2)) + '</pre>' +
            '<div class="chat-tool-label">Output</div>' +
            '<pre>' + simEscHtml(JSON.stringify(tc.result, null, 2)) + '</pre>' +
            '</div></div>';
        }
      }

      simAddChatMsgHtml('assistant', html);
      simChatHistory.push({ role: 'assistant', content: data.reply || '' });
    }
    simChatBusy = false;
    document.getElementById('chat-send-btn').disabled = false;
  })
  .catch(err => {
    simRemoveTyping(typingId);
    simAddChatMsg('system', 'Network error: ' + err.message);
    simChatBusy = false;
    document.getElementById('chat-send-btn').disabled = false;
  });
}

function simChatSendInput() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  simChatSend(text);
}

function simChatClear() {
  simChatHistory = [];
  document.getElementById('chat-messages').innerHTML =
    '<div class="chat-msg system">Conversation cleared. Start fresh!</div>';
}

function simAddChatMsg(role, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function simAddChatMsgHtml(role, html) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function simAddChatTyping(id) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-typing';
  div.id = id;
  div.textContent = 'Thinking...';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function simRemoveTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function simEscHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ══ Walkthrough Mode ═══════════════════════════════ */
const WT_SCENARIOS = [
  {
    id: 'health',
    title: 'System Health Check',
    description: 'Verify the server is running and check provider configuration.',
    steps: [
      { tool: 'comms_ping', description: 'Send a ping to check server status, pool info, and active providers.', args: { message: 'health check' } }
    ]
  },
  {
    id: 'onboard-message',
    title: 'Onboard & Message',
    description: 'Create a new agent, check channels, then send messages on all three channels.',
    steps: [
      { tool: 'comms_onboard_customer', description: 'Onboard a new customer with SMS, email, and voice channels.', args: { displayName: 'Demo Customer', email: 'demo@example.com', enableSms: true, enableEmail: true, enableVoice: true } },
      { tool: 'comms_get_channel_status', description: 'Check which channels were provisioned for the new agent.', args: { agentId: 'agent-001' } },
      { tool: 'comms_send_message', description: 'Send an SMS to a test number.', args: { agentId: 'agent-001', to: '+15551234567', body: 'Hello via SMS!', channel: 'sms' } },
      { tool: 'comms_send_message', description: 'Send an email to a test address.', args: { agentId: 'agent-001', to: 'test@example.com', body: 'Hello via email!', channel: 'email', subject: 'Test Email' } },
      { tool: 'comms_send_message', description: 'Send a WhatsApp message.', args: { agentId: 'agent-001', to: '+15551234567', body: 'Hello via WhatsApp!', channel: 'whatsapp' } }
    ]
  },
  {
    id: 'voice',
    title: 'Voice Calls',
    description: 'Send a voice message, make an AI call, and transfer a call.',
    steps: [
      { tool: 'comms_send_voice_message', description: 'Send a pre-recorded voice message using TTS.', args: { agentId: 'agent-001', to: '+15551234567', message: 'This is a test voice message.' } },
      { tool: 'comms_make_call', description: 'Initiate an outbound AI voice conversation.', args: { agentId: 'agent-001', to: '+15551234567', greeting: 'Hi! This is a demo call.' } },
      { tool: 'comms_transfer_call', description: 'Transfer a live call to another number.', args: { agentId: 'agent-001', callSid: 'CA1234567890abcdef', transferTo: '+15559876543' } }
    ]
  },
  {
    id: 'otp',
    title: 'OTP Verification',
    description: 'Send a one-time verification code and verify it.',
    steps: [
      { tool: 'comms_send_otp', description: 'Send a 6-digit verification code via SMS.', args: { agentId: 'agent-001', to: '+15551234567', channel: 'sms' } },
      { tool: 'comms_verify_otp', description: 'Verify the submitted code.', args: { agentId: 'agent-001', to: '+15551234567', code: '123456' } }
    ]
  },
  {
    id: 'billing',
    title: 'Usage & Billing',
    description: 'View usage stats, set limits, configure billing, and get a billing summary.',
    steps: [
      { tool: 'comms_get_usage_dashboard', description: 'View current usage and rate limit status.', args: { agentId: 'agent-001' } },
      { tool: 'comms_set_agent_limits', description: 'Set rate limits for the agent.', args: { agentId: 'agent-001', maxActionsPerDay: 1000, maxSpendPerDay: 50 } },
      { tool: 'comms_set_billing_config', description: 'Configure billing tier and markup.', args: { agentId: 'agent-001', tier: 'pro', markupPercent: 20, billingEmail: 'billing@acme.com' } },
      { tool: 'comms_get_billing_summary', description: 'Get billing breakdown for the current month.', args: { agentId: 'agent-001', period: 'month' } }
    ]
  },
  {
    id: 'provider-history',
    title: 'Provider & History',
    description: 'Register a provider and view message history.',
    steps: [
      { tool: 'comms_register_provider', description: 'Register (verify) Twilio credentials.', args: { provider: 'twilio', credentials: { accountSid: 'ACtest123', authToken: 'test_token' }, verify: false } },
      { tool: 'comms_get_messages', description: 'Retrieve recent message history.', args: { agentId: 'agent-001', limit: 10 } }
    ]
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure Management',
    description: 'Expand the agent pool, provision and deprovision channels.',
    steps: [
      { tool: 'comms_expand_agent_pool', description: 'Resize the agent pool to 10 slots.', args: { newSize: 10 } },
      { tool: 'comms_provision_channels', description: 'Provision SMS and email channels for an agent.', args: { agentId: 'agent-001', channels: 'sms,email' } },
      { tool: 'comms_deprovision_channels', description: 'Release all channels for the agent.', args: { agentId: 'agent-001' } }
    ]
  }
];

let wtCurrentScenario = null;
let wtCurrentStep = 0;

function wtRenderScenarios() {
  const container = document.getElementById('wt-scenarios');
  container.innerHTML = WT_SCENARIOS.map(s => {
    const tools = s.steps.map(st => '<span class="wt-tool-badge">' + simEscHtml(st.tool) + '</span>').join('');
    return '<div class="wt-scenario-card" onclick="wtStartScenario(\\'' + s.id + '\\')">' +
      '<h3>' + simEscHtml(s.title) + '</h3>' +
      '<p>' + simEscHtml(s.description) + '</p>' +
      '<div class="wt-tools-badges">' + tools + '</div>' +
      '</div>';
  }).join('');
}

function wtStartScenario(id) {
  wtCurrentScenario = WT_SCENARIOS.find(s => s.id === id);
  if (!wtCurrentScenario) return;
  wtCurrentStep = 0;

  document.getElementById('wt-scenarios').style.display = 'none';
  document.getElementById('wt-step-view').classList.add('active');
  wtRenderStep();
}

function wtRenderStep() {
  if (!wtCurrentScenario) return;
  const step = wtCurrentScenario.steps[wtCurrentStep];
  const total = wtCurrentScenario.steps.length;
  const view = document.getElementById('wt-step-view');

  let fieldsHtml = '';
  const toolDef = simTools.find(t => t.name === step.tool);
  if (toolDef) {
    for (const p of toolDef.parameters) {
      const val = step.args[p.name];
      const displayVal = val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : '';
      fieldsHtml += '<div class="pg-form-field">' +
        '<label>' + simEscHtml(p.name) + (p.required ? '<span class="pg-required">*</span>' : '') + '</label>' +
        '<input type="text" id="wt-field-' + p.name + '" value="' + simEscAttr(displayVal) + '">' +
        '</div>';
    }
  }

  view.innerHTML =
    '<div class="wt-step-header">' +
    '<h3>' + simEscHtml(wtCurrentScenario.title) + '</h3>' +
    '<span class="wt-step-progress">Step ' + (wtCurrentStep + 1) + ' of ' + total + '</span>' +
    '</div>' +
    '<div class="wt-step-description">' +
    '<strong>' + simEscHtml(step.tool) + '</strong> &mdash; ' + simEscHtml(step.description) +
    '</div>' +
    '<div class="wt-step-params">' + fieldsHtml + '</div>' +
    '<div class="wt-step-actions">' +
    '<button class="btn btn-primary" id="wt-run-btn" onclick="wtRunStep()">Run Step</button>' +
    (wtCurrentStep > 0 ? '<button class="btn btn-secondary" onclick="wtPrevStep()">Previous</button>' : '') +
    '<button class="btn btn-secondary" onclick="wtBackToScenarios()">Back</button>' +
    '</div>' +
    '<div class="wt-step-result" id="wt-step-result">' +
    '<pre id="wt-result-pre"></pre>' +
    '<div class="wt-step-actions" style="margin-top:0.75rem;">' +
    (wtCurrentStep < total - 1 ? '<button class="btn btn-primary" onclick="wtNextStep()">Next Step</button>' : '<button class="btn btn-success" onclick="wtBackToScenarios()">Done!</button>') +
    '</div>' +
    '</div>';
}

async function wtRunStep() {
  if (!wtCurrentScenario) return;
  const step = wtCurrentScenario.steps[wtCurrentStep];
  const toolDef = simTools.find(t => t.name === step.tool);

  // Gather args from form
  const args = {};
  if (toolDef) {
    for (const p of toolDef.parameters) {
      const el = document.getElementById('wt-field-' + p.name);
      if (el && el.value.trim()) {
        let val = el.value.trim();
        if (p.type === 'number') val = Number(val);
        else if (p.type === 'boolean') val = val === 'true';
        else if (p.type === 'object') {
          try { val = JSON.parse(val); } catch {}
        }
        args[p.name] = val;
      }
    }
  }

  const runBtn = document.getElementById('wt-run-btn');
  runBtn.disabled = true;
  runBtn.textContent = 'Running...';

  try {
    const res = await apiFetch('/admin/api/simulator/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: step.tool, args })
    });
    const data = await res.json();

    document.getElementById('wt-result-pre').textContent =
      JSON.stringify(data.result || data, null, 2);
    document.getElementById('wt-step-result').classList.add('visible');
  } catch (err) {
    document.getElementById('wt-result-pre').textContent = 'Error: ' + err.message;
    document.getElementById('wt-step-result').classList.add('visible');
  }

  runBtn.disabled = false;
  runBtn.textContent = 'Run Step';
}

function wtNextStep() {
  if (!wtCurrentScenario) return;
  if (wtCurrentStep < wtCurrentScenario.steps.length - 1) {
    wtCurrentStep++;
    wtRenderStep();
  }
}

function wtPrevStep() {
  if (wtCurrentStep > 0) {
    wtCurrentStep--;
    wtRenderStep();
  }
}

function wtBackToScenarios() {
  wtCurrentScenario = null;
  wtCurrentStep = 0;
  document.getElementById('wt-scenarios').style.display = '';
  document.getElementById('wt-step-view').classList.remove('active');
}

/* ══ Playground Mode ════════════════════════════════ */
function pgPopulateTools() {
  const select = document.getElementById('pg-tool-select');
  let html = '<option value="">Select a tool...</option>';

  const catOrder = ['System', 'Messaging', 'Voice', 'Verification', 'Provisioning', 'Admin', 'Billing'];
  for (const cat of catOrder) {
    const tools = (simCategories[cat] || []);
    if (tools.length === 0) continue;
    html += '<optgroup label="' + simEscAttr(cat) + '">';
    for (const t of tools) {
      html += '<option value="' + simEscAttr(t.name) + '">' + simEscHtml(t.name) + '</option>';
    }
    html += '</optgroup>';
  }

  select.innerHTML = html;
}

function pgToolChanged() {
  const toolName = document.getElementById('pg-tool-select').value;
  const toolDef = simTools.find(t => t.name === toolName);
  const descEl = document.getElementById('pg-tool-desc');
  const fieldsEl = document.getElementById('pg-form-fields');
  const executeBtn = document.getElementById('pg-execute-btn');
  const copyBtn = document.getElementById('pg-copy-btn');

  if (!toolDef) {
    descEl.style.display = 'none';
    fieldsEl.innerHTML = '';
    executeBtn.disabled = true;
    copyBtn.style.display = 'none';
    return;
  }

  descEl.textContent = toolDef.description;
  descEl.style.display = 'block';
  executeBtn.disabled = false;
  copyBtn.style.display = 'inline-flex';

  let html = '';
  for (const p of toolDef.parameters) {
    const demoVal = toolDef.demoValues[p.name];
    const displayVal = demoVal !== undefined ? (typeof demoVal === 'object' ? JSON.stringify(demoVal) : String(demoVal)) : '';

    html += '<div class="pg-form-field">';
    html += '<label>' + simEscHtml(p.name) + (p.required ? '<span class="pg-required">*</span>' : '') + '</label>';

    if (p.enum && p.enum.length > 0) {
      html += '<select id="pg-field-' + p.name + '">';
      if (!p.required) html += '<option value="">(none)</option>';
      for (const opt of p.enum) {
        const sel = (displayVal === opt) ? ' selected' : '';
        html += '<option value="' + simEscAttr(opt) + '"' + sel + '>' + simEscHtml(opt) + '</option>';
      }
      html += '</select>';
    } else if (p.type === 'boolean') {
      html += '<select id="pg-field-' + p.name + '">';
      html += '<option value="">(default)</option>';
      html += '<option value="true"' + (displayVal === 'true' ? ' selected' : '') + '>true</option>';
      html += '<option value="false"' + (displayVal === 'false' ? ' selected' : '') + '>false</option>';
      html += '</select>';
    } else if (p.type === 'object') {
      html += '<textarea id="pg-field-' + p.name + '" rows="3">' + simEscHtml(displayVal) + '</textarea>';
    } else {
      html += '<input type="' + (p.type === 'number' ? 'number' : 'text') + '" id="pg-field-' + p.name + '" value="' + simEscAttr(displayVal) + '" placeholder="' + simEscAttr(p.description) + '">';
    }

    html += '</div>';
  }

  fieldsEl.innerHTML = html;
}

function pgGatherArgs() {
  const toolName = document.getElementById('pg-tool-select').value;
  const toolDef = simTools.find(t => t.name === toolName);
  if (!toolDef) return {};

  const args = {};
  for (const p of toolDef.parameters) {
    const el = document.getElementById('pg-field-' + p.name);
    if (!el) continue;
    const raw = el.value.trim();
    if (!raw) continue;

    if (p.type === 'number') args[p.name] = Number(raw);
    else if (p.type === 'boolean') args[p.name] = raw === 'true';
    else if (p.type === 'object') {
      try { args[p.name] = JSON.parse(raw); } catch { args[p.name] = raw; }
    }
    else args[p.name] = raw;
  }
  return args;
}

async function pgExecute() {
  const toolName = document.getElementById('pg-tool-select').value;
  if (!toolName) return;

  const args = pgGatherArgs();
  const btn = document.getElementById('pg-execute-btn');
  btn.disabled = true;
  btn.textContent = 'Executing...';

  document.getElementById('pg-result-tool').textContent = toolName;
  document.getElementById('pg-result-time').textContent = '...';
  document.getElementById('pg-result-status').textContent = '...';

  try {
    const res = await apiFetch('/admin/api/simulator/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: toolName, args })
    });
    const data = await res.json();

    const formatted = JSON.stringify(data.result || data, null, 2);
    document.getElementById('pg-result').innerHTML = pgHighlightJson(formatted);
    document.getElementById('pg-result-time').textContent = (data.durationMs || 0) + 'ms';
    document.getElementById('pg-result-status').textContent = data.isError ? 'error' : 'success';
    document.getElementById('pg-result-status').style.color = data.isError ? 'var(--error)' : 'var(--success)';

    // Add to history
    pgExecutionHistory.unshift({ tool: toolName, time: new Date().toLocaleTimeString(), result: formatted, duration: data.durationMs || 0 });
    if (pgExecutionHistory.length > 10) pgExecutionHistory.pop();
    pgRenderHistory();
  } catch (err) {
    document.getElementById('pg-result').textContent = 'Error: ' + err.message;
    document.getElementById('pg-result-status').textContent = 'error';
    document.getElementById('pg-result-status').style.color = 'var(--error)';
  }

  btn.disabled = false;
  btn.textContent = 'Execute';
}

function pgCopyArgs() {
  const args = pgGatherArgs();
  const toolName = document.getElementById('pg-tool-select').value;
  const payload = JSON.stringify({ tool: toolName, args }, null, 2);
  navigator.clipboard.writeText(payload).then(() => {
    showToast('Copied to clipboard', 'success');
  }).catch(() => {
    showToast('Copy failed', 'error');
  });
}

function pgRenderHistory() {
  const container = document.getElementById('pg-history-list');
  if (pgExecutionHistory.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;">No executions yet</div>';
    return;
  }
  container.innerHTML = pgExecutionHistory.map((h, i) =>
    '<div class="pg-history-item" onclick="pgShowHistoryResult(' + i + ')">' +
    '<span class="pg-hist-tool">' + simEscHtml(h.tool) + '</span>' +
    '<span>' + h.duration + 'ms &middot; ' + h.time + '</span>' +
    '</div>'
  ).join('');
}

function pgShowHistoryResult(idx) {
  const h = pgExecutionHistory[idx];
  if (!h) return;
  document.getElementById('pg-result').innerHTML = pgHighlightJson(h.result);
  document.getElementById('pg-result-tool').textContent = h.tool;
  document.getElementById('pg-result-time').textContent = h.duration + 'ms';
}

function pgHighlightJson(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="pg-json-key">"$1"</span>')
    .replace(/:\s*"([^"]*)"/g, ': <span class="pg-json-string">"$1"</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="pg-json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="pg-json-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="pg-json-null">$1</span>');
}

function simEscAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
</script>
`;
}
