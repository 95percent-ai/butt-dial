/** Returns the complete HTML for the setup page */
export function renderSetupPage(): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentOS Comms — Setup</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f1117;
      color: #e1e4e8;
      min-height: 100vh;
      padding: 2rem;
    }

    .container { max-width: 720px; margin: 0 auto; }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      color: #8b949e;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }

    /* Provider card */
    .card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
    }

    .card-desc {
      font-size: 0.8rem;
      color: #8b949e;
      margin-bottom: 1rem;
    }

    .badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge.configured { background: #0d2818; color: #3fb950; border: 1px solid #238636; }
    .badge.missing { background: #2d1b1b; color: #f85149; border: 1px solid #da3633; }
    .badge.optional { background: #1c1d21; color: #8b949e; border: 1px solid #30363d; }
    .badge.loading { background: #1c1d21; color: #8b949e; border: 1px solid #30363d; }

    /* Form fields */
    .field {
      margin-bottom: 0.75rem;
    }

    .field label {
      display: block;
      font-size: 0.8rem;
      color: #8b949e;
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .input-wrap {
      position: relative;
      display: flex;
    }

    .input-wrap input {
      flex: 1;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 0.375rem;
      padding: 0.5rem 2.5rem 0.5rem 0.75rem;
      color: #e1e4e8;
      font-size: 0.875rem;
      font-family: ui-monospace, "SF Mono", monospace;
      outline: none;
      transition: border-color 0.15s;
    }

    .input-wrap input:focus {
      border-color: #58a6ff;
    }

    .input-wrap input::placeholder {
      color: #484f58;
    }

    .toggle-vis {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #484f58;
      cursor: pointer;
      font-size: 0.75rem;
      padding: 0.25rem;
    }

    .toggle-vis:hover { color: #8b949e; }

    /* Buttons */
    .card-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    button {
      font-family: inherit;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      border-radius: 0.375rem;
      padding: 0.5rem 1rem;
      transition: all 0.15s;
    }

    .btn-test {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
    }

    .btn-test:hover { background: #30363d; }
    .btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-save {
      background: #238636;
      border: 1px solid #2ea043;
      color: #fff;
    }

    .btn-save:hover { background: #2ea043; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Test result */
    .test-result {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      min-height: 1.2rem;
    }

    .test-result.success { color: #3fb950; }
    .test-result.error { color: #f85149; }
    .test-result.loading { color: #8b949e; }
    .test-result.saved { color: #3fb950; }

    /* Deploy button */
    .btn-deploy {
      background: #1f6feb;
      border: 1px solid #388bfd;
      color: #fff;
      font-size: 0.875rem;
      padding: 0.625rem 1.5rem;
      margin-top: 1.5rem;
    }

    .btn-deploy:hover { background: #388bfd; }
    .btn-deploy:disabled { opacity: 0.5; cursor: not-allowed; }

    .deploy-result {
      margin-top: 0.75rem;
      font-size: 0.85rem;
      min-height: 1.2rem;
    }

    .deploy-result.loading { color: #8b949e; }
    .deploy-result.success { color: #3fb950; }
    .deploy-result.error { color: #f85149; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AgentOS Comms Setup</h1>
    <p class="subtitle">Configure your communication providers</p>

    <!-- Twilio Card -->
    <div class="card" id="twilio-card">
      <div class="card-header">
        <span class="card-title">Twilio</span>
        <span class="badge loading" id="twilio-badge">loading...</span>
      </div>
      <p class="card-desc">SMS, voice calls, and WhatsApp. Required for telephony channels.</p>

      <div class="field">
        <label for="twilio-sid">Account SID</label>
        <div class="input-wrap">
          <input type="password" id="twilio-sid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" />
          <button type="button" class="toggle-vis" data-target="twilio-sid">show</button>
        </div>
      </div>

      <div class="field">
        <label for="twilio-token">Auth Token</label>
        <div class="input-wrap">
          <input type="password" id="twilio-token" placeholder="your auth token" autocomplete="off" />
          <button type="button" class="toggle-vis" data-target="twilio-token">show</button>
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-test" id="twilio-test-btn">Test Connection</button>
      </div>
      <div class="test-result" id="twilio-test-result"></div>
    </div>

    <!-- ElevenLabs Card -->
    <div class="card" id="elevenlabs-card">
      <div class="card-header">
        <span class="card-title">ElevenLabs</span>
        <span class="badge loading" id="elevenlabs-badge">loading...</span>
      </div>
      <p class="card-desc">Premium text-to-speech. Optional — falls back to free Edge TTS.</p>

      <div class="field">
        <label for="elevenlabs-key">API Key</label>
        <div class="input-wrap">
          <input type="password" id="elevenlabs-key" placeholder="your ElevenLabs API key" autocomplete="off" />
          <button type="button" class="toggle-vis" data-target="elevenlabs-key">show</button>
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-test" id="elevenlabs-test-btn">Test Connection</button>
      </div>
      <div class="test-result" id="elevenlabs-test-result"></div>
    </div>

    <!-- Resend Card -->
    <div class="card" id="resend-card">
      <div class="card-header">
        <span class="card-title">Resend</span>
        <span class="badge loading" id="resend-badge">loading...</span>
      </div>
      <p class="card-desc">Email sending and receiving. Required for the email channel.</p>

      <div class="field">
        <label for="resend-key">API Key</label>
        <div class="input-wrap">
          <input type="password" id="resend-key" placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" />
          <button type="button" class="toggle-vis" data-target="resend-key">show</button>
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-test" id="resend-test-btn">Test Connection</button>
      </div>
      <div class="test-result" id="resend-test-result"></div>
    </div>

    <!-- Server Settings Card -->
    <div class="card" id="server-card">
      <div class="card-header">
        <span class="card-title">Server Settings</span>
        <span class="badge loading" id="server-badge">loading...</span>
      </div>
      <p class="card-desc">Webhook URL for inbound messages and security token for tool calls.</p>

      <div class="field">
        <label for="server-webhook-url">Webhook Base URL</label>
        <div class="input-wrap">
          <input type="text" id="server-webhook-url" placeholder="https://your-domain.com" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label for="server-master-token">Master Security Token</label>
        <div class="input-wrap">
          <input type="password" id="server-master-token" placeholder="a strong random token" autocomplete="off" />
          <button type="button" class="toggle-vis" data-target="server-master-token">show</button>
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-save" id="server-save-btn">Save</button>
      </div>
      <div class="test-result" id="server-test-result"></div>
    </div>

    <!-- Voice Defaults Card -->
    <div class="card" id="voice-card">
      <div class="card-header">
        <span class="card-title">Voice Defaults</span>
        <span class="badge loading" id="voice-badge">loading...</span>
      </div>
      <p class="card-desc">Default greeting, voice, and language for new voice calls. Optional — sensible defaults are built in.</p>

      <div class="field">
        <label for="voice-greeting">Default Greeting</label>
        <div class="input-wrap">
          <input type="text" id="voice-greeting" placeholder="Hello! How can I help you?" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label for="voice-voice">Voice ID</label>
        <div class="input-wrap">
          <input type="text" id="voice-voice" placeholder="ElevenLabs voice ID" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label for="voice-language">Language</label>
        <div class="input-wrap">
          <input type="text" id="voice-language" placeholder="en-US" autocomplete="off" />
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-save" id="voice-save-btn">Save</button>
      </div>
      <div class="test-result" id="voice-test-result"></div>
    </div>

    <button type="button" class="btn-deploy" id="deploy-btn">Deploy</button>
    <div class="deploy-result" id="deploy-result"></div>

  </div>

  <script>
    // Show/Hide toggle
    document.querySelectorAll(".toggle-vis").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        if (input.type === "password") {
          input.type = "text";
          btn.textContent = "hide";
        } else {
          input.type = "password";
          btn.textContent = "show";
        }
      });
    });

    // Load status on page load
    async function loadStatus() {
      try {
        const res = await fetch("/admin/api/status");
        const data = await res.json();

        setBadge("twilio-badge", data.twilio.configured);
        setBadge("elevenlabs-badge", data.elevenlabs.configured, true);
        setBadge("resend-badge", data.resend.configured);
        setBadge("server-badge", data.server.configured);
        setBadge("voice-badge", data.voice.configured, true);

        // Show masked values as placeholders if configured
        if (data.twilio.accountSid) {
          document.getElementById("twilio-sid").placeholder = data.twilio.accountSid;
        }
        if (data.twilio.authToken) {
          document.getElementById("twilio-token").placeholder = data.twilio.authToken;
        }
        if (data.elevenlabs.apiKey) {
          document.getElementById("elevenlabs-key").placeholder = data.elevenlabs.apiKey;
        }
        if (data.resend.apiKey) {
          document.getElementById("resend-key").placeholder = data.resend.apiKey;
        }
        if (data.server.webhookBaseUrl) {
          document.getElementById("server-webhook-url").placeholder = data.server.webhookBaseUrl;
        }
        if (data.server.masterSecurityToken) {
          document.getElementById("server-master-token").placeholder = data.server.masterSecurityToken;
        }
        if (data.voice.greeting) {
          document.getElementById("voice-greeting").placeholder = data.voice.greeting;
        }
        if (data.voice.voice) {
          document.getElementById("voice-voice").placeholder = data.voice.voice;
        }
        if (data.voice.language) {
          document.getElementById("voice-language").placeholder = data.voice.language;
        }
      } catch {
        setBadge("twilio-badge", false);
        setBadge("elevenlabs-badge", false, true);
        setBadge("resend-badge", false);
        setBadge("server-badge", false);
        setBadge("voice-badge", false, true);
      }
    }

    function setBadge(id, configured, optional) {
      const badge = document.getElementById(id);
      if (configured) {
        badge.className = "badge configured";
        badge.textContent = "configured";
      } else if (optional) {
        badge.className = "badge optional";
        badge.textContent = "optional";
      } else {
        badge.className = "badge missing";
        badge.textContent = "missing";
      }
    }

    loadStatus();

    // Auto-save helper (for test-then-save flow)
    async function autoSave(credentials, resultId) {
      showResult(resultId, "loading", "Saving...");
      try {
        const res = await fetch("/admin/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentials }),
        });
        const data = await res.json();
        if (data.success) {
          showResult(resultId, "saved", "Connected and saved");
          loadStatus();
        } else {
          showResult(resultId, "error", "Connected but save failed: " + (data.message || "unknown"));
        }
      } catch {
        showResult(resultId, "error", "Connected but save failed");
      }
    }

    // Direct save helper (for cards without external API test)
    async function directSave(credentials, resultId) {
      showResult(resultId, "loading", "Saving...");
      try {
        const res = await fetch("/admin/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentials }),
        });
        const data = await res.json();
        if (data.success) {
          showResult(resultId, "saved", "Saved");
          loadStatus();
        } else {
          showResult(resultId, "error", "Save failed: " + (data.message || "unknown"));
        }
      } catch {
        showResult(resultId, "error", "Save failed");
      }
    }

    // Test Twilio
    document.getElementById("twilio-test-btn").addEventListener("click", async () => {
      const sid = document.getElementById("twilio-sid").value.trim();
      const token = document.getElementById("twilio-token").value.trim();

      if (!sid || !token) {
        showResult("twilio-test-result", "error", "Enter both Account SID and Auth Token");
        return;
      }

      const btn = document.getElementById("twilio-test-btn");
      btn.disabled = true;
      showResult("twilio-test-result", "loading", "Testing...");

      try {
        const res = await fetch("/admin/api/test/twilio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountSid: sid, authToken: token }),
        });
        const data = await res.json();

        if (data.success) {
          showResult("twilio-test-result", "success", data.message);
          await autoSave({ TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token }, "twilio-test-result");
        } else {
          showResult("twilio-test-result", "error", data.message);
        }
      } catch {
        showResult("twilio-test-result", "error", "Request failed");
      } finally {
        btn.disabled = false;
      }
    });

    // Test ElevenLabs
    document.getElementById("elevenlabs-test-btn").addEventListener("click", async () => {
      const key = document.getElementById("elevenlabs-key").value.trim();

      if (!key) {
        showResult("elevenlabs-test-result", "error", "Enter an API key");
        return;
      }

      const btn = document.getElementById("elevenlabs-test-btn");
      btn.disabled = true;
      showResult("elevenlabs-test-result", "loading", "Testing...");

      try {
        const res = await fetch("/admin/api/test/elevenlabs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key }),
        });
        const data = await res.json();

        if (data.success) {
          showResult("elevenlabs-test-result", "success", data.message);
          await autoSave({ ELEVENLABS_API_KEY: key }, "elevenlabs-test-result");
        } else {
          showResult("elevenlabs-test-result", "error", data.message);
        }
      } catch {
        showResult("elevenlabs-test-result", "error", "Request failed");
      } finally {
        btn.disabled = false;
      }
    });

    // Test Resend
    document.getElementById("resend-test-btn").addEventListener("click", async () => {
      const key = document.getElementById("resend-key").value.trim();

      if (!key) {
        showResult("resend-test-result", "error", "Enter an API key");
        return;
      }

      const btn = document.getElementById("resend-test-btn");
      btn.disabled = true;
      showResult("resend-test-result", "loading", "Testing...");

      try {
        const res = await fetch("/admin/api/test/resend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key }),
        });
        const data = await res.json();

        if (data.success) {
          showResult("resend-test-result", "success", data.message);
          await autoSave({ RESEND_API_KEY: key }, "resend-test-result");
        } else {
          showResult("resend-test-result", "error", data.message);
        }
      } catch {
        showResult("resend-test-result", "error", "Request failed");
      } finally {
        btn.disabled = false;
      }
    });

    // Save Server Settings
    document.getElementById("server-save-btn").addEventListener("click", async () => {
      const url = document.getElementById("server-webhook-url").value.trim();
      const token = document.getElementById("server-master-token").value.trim();

      if (!url && !token) {
        showResult("server-test-result", "error", "Enter at least one field");
        return;
      }

      const credentials = {};
      if (url) credentials.WEBHOOK_BASE_URL = url;
      if (token) credentials.MASTER_SECURITY_TOKEN = token;

      const btn = document.getElementById("server-save-btn");
      btn.disabled = true;
      await directSave(credentials, "server-test-result");
      btn.disabled = false;
    });

    // Save Voice Defaults
    document.getElementById("voice-save-btn").addEventListener("click", async () => {
      const greeting = document.getElementById("voice-greeting").value.trim();
      const voice = document.getElementById("voice-voice").value.trim();
      const lang = document.getElementById("voice-language").value.trim();

      if (!greeting && !voice && !lang) {
        showResult("voice-test-result", "error", "Enter at least one field");
        return;
      }

      const credentials = {};
      if (greeting) credentials.VOICE_DEFAULT_GREETING = greeting;
      if (voice) credentials.VOICE_DEFAULT_VOICE = voice;
      if (lang) credentials.VOICE_DEFAULT_LANGUAGE = lang;

      const btn = document.getElementById("voice-save-btn");
      btn.disabled = true;
      await directSave(credentials, "voice-test-result");
      btn.disabled = false;
    });

    // Deploy
    document.getElementById("deploy-btn").addEventListener("click", async () => {
      const btn = document.getElementById("deploy-btn");
      const result = document.getElementById("deploy-result");
      btn.disabled = true;
      result.className = "deploy-result loading";
      result.textContent = "Restarting server...";

      try {
        await fetch("/admin/api/deploy", { method: "POST" });
      } catch {
        // Expected — server dies mid-response
      }

      // Poll until server is back
      let attempts = 0;
      const maxAttempts = 20;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch("/health");
          if (res.ok) {
            clearInterval(poll);
            result.className = "deploy-result success";
            result.textContent = "Server restarted";
            btn.disabled = false;
            loadStatus();
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            result.className = "deploy-result error";
            result.textContent = "Server did not come back — check terminal";
            btn.disabled = false;
          }
        }
      }, 1000);
    });

    // Helpers
    function showResult(id, type, message) {
      const el = document.getElementById(id);
      el.className = "test-result " + type;
      el.textContent = message;
    }
  </script>
</body>
</html>`;
}
