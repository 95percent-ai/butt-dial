/**
 * Unified Admin Page — single-page admin UI with sidebar navigation.
 * Combines dashboard, settings, agents, API docs, and simulator into one page.
 * All CSS and JS inline (no external files except Chart.js and Swagger UI CDNs).
 */

import { renderSimulatorTab } from "./simulator-page.js";

export function renderAdminPage(specJson: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Butt-Dial Admin</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
  <style>
    /* ── CSS Variables ─────────────────────────────────────────── */
    :root {
      --bg-body: #0f1117;
      --bg-sidebar: #0d1117;
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
      --warning: #d29922;
      --warning-bg: #2e1f0f;
      --info: #58a6ff;
      --radius: 8px;
      --sidebar-width: 220px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    }

    /* ── Reset ──────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg-body);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ── Login Overlay ──────────────────────────────────────────── */
    #login-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--bg-body);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #login-overlay.hidden { display: none; }

    .login-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }

    .login-box h1 {
      font-size: 1.5rem;
      color: var(--text-heading);
      margin-bottom: 0.5rem;
    }

    .login-box p {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }

    .login-box input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 0.95rem;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .login-box input:focus { border-color: var(--border-focus); }

    .login-box button {
      width: 100%;
      padding: 0.75rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .login-box button:hover { background: var(--accent-hover); }

    .login-error {
      color: var(--error);
      font-size: 0.85rem;
      margin-top: 0.75rem;
      min-height: 1.2em;
    }

    /* ── Demo Banner ────────────────────────────────────────────── */
    #demo-banner {
      display: none;
      background: var(--warning);
      color: #000;
      text-align: center;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }

    #demo-banner.visible { display: block; }

    /* ── App Layout ─────────────────────────────────────────────── */
    .app-layout {
      display: flex;
      min-height: 100vh;
    }

    /* ── Sidebar ────────────────────────────────────────────────── */
    .sidebar {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
    }

    .sidebar-logo {
      padding: 1.25rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-logo h2 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.01em;
    }

    .sidebar-logo span {
      font-size: 0.7rem;
      color: var(--text-muted);
      display: block;
      margin-top: 2px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 0.75rem 0;
    }

    .sidebar-nav a {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 1rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
      border-left: 3px solid transparent;
    }

    .sidebar-nav a:hover {
      background: rgba(88, 166, 255, 0.06);
      color: var(--text);
    }

    .sidebar-nav a.active {
      color: var(--accent);
      background: rgba(88, 166, 255, 0.1);
      border-left-color: var(--accent);
    }

    .sidebar-nav a svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .sidebar-bottom {
      padding: 1rem;
      border-top: 1px solid var(--border);
    }

    .sidebar-bottom button {
      width: 100%;
      padding: 0.5rem 0.75rem;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .sidebar-bottom button:hover {
      border-color: var(--error);
      color: var(--error);
    }

    /* ── Content Area ───────────────────────────────────────────── */
    .content {
      flex: 1;
      margin-left: var(--sidebar-width);
      padding: 2rem;
      min-height: 100vh;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* ── Shared Components ──────────────────────────────────────── */
    .page-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      margin-bottom: 1rem;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-heading);
    }

    .card-desc {
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-bottom: 1rem;
    }

    .group-heading {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      margin-top: 1.5rem;
    }

    .group-heading:first-child { margin-top: 0; }

    /* ── Form Elements ──────────────────────────────────────────── */
    .field { margin-bottom: 0.75rem; }

    .field label {
      display: block;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.3rem;
    }

    .field input,
    .field select,
    .field textarea {
      width: 100%;
      padding: 0.55rem 0.75rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 0.875rem;
      font-family: var(--font);
      outline: none;
      transition: border-color 0.2s;
    }

    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      border-color: var(--border-focus);
    }

    .field textarea {
      resize: vertical;
      min-height: 70px;
    }

    .field select {
      cursor: pointer;
      appearance: auto;
    }

    /* ── Buttons ─────────────────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      font-family: var(--font);
    }

    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { border-color: var(--text-muted); color: var(--text); }

    .btn-success { background: var(--success); color: #fff; }
    .btn-success:hover { opacity: 0.9; }

    .btn-danger { background: var(--error); color: #fff; }
    .btn-danger:hover { opacity: 0.9; }

    .btn-sm { padding: 0.35rem 0.7rem; font-size: 0.75rem; }

    /* ── Status Indicators ──────────────────────────────────────── */
    .test-result {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      margin-left: 0.5rem;
      min-height: 1.5em;
    }

    .test-result.success { color: var(--success); }
    .test-result.error { color: var(--error); }

    .badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge-success { background: var(--success-bg); color: var(--success); border: 1px solid #238636; }
    .badge-error { background: var(--error-bg); color: var(--error); border: 1px solid #da3633; }
    .badge-warning { background: var(--warning-bg); color: var(--warning); border: 1px solid #9e6a03; }
    .badge-info { background: rgba(88, 166, 255, 0.1); color: var(--accent); border: 1px solid rgba(88, 166, 255, 0.3); }

    /* ── Dashboard ───────────────────────────────────────────────── */
    .health-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .health-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: center;
    }

    .health-card .big-number {
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
      line-height: 1.2;
    }

    .health-card .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.35rem;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .chart-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
    }

    .chart-card h3 {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 1rem;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
    }

    .chart-wrapper canvas {
      width: 100% !important;
    }

    /* ── Progress Bars ──────────────────────────────────────────── */
    .progress-section { margin-bottom: 1.5rem; }

    .progress-item {
      margin-bottom: 0.75rem;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      margin-bottom: 0.3rem;
    }

    .progress-header .label { color: var(--text-muted); }
    .progress-header .value { color: var(--text); font-weight: 600; }

    .progress-bar {
      height: 8px;
      background: var(--bg-input);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--accent);
      transition: width 0.5s ease;
    }

    .progress-fill.warn { background: var(--warning); }
    .progress-fill.danger { background: var(--error); }

    /* ── Alerts Table ───────────────────────────────────────────── */
    .alerts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
    }

    .alerts-table th {
      text-align: left;
      padding: 0.6rem 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }

    .alerts-table td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .alerts-table tr:last-child td { border-bottom: none; }

    .severity-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .severity-CRITICAL { background: #b71c1c; color: #fff; }
    .severity-HIGH { background: #e65100; color: #fff; }
    .severity-MEDIUM { background: var(--warning-bg); color: var(--warning); }
    .severity-LOW { background: var(--success-bg); color: var(--success); }
    .severity-INFO { background: rgba(88, 166, 255, 0.1); color: var(--accent); }

    /* ── Settings ────────────────────────────────────────────────── */
    .settings-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .conditional-field { display: none; }
    .conditional-field.visible { display: block; }

    /* ── Agents Table ────────────────────────────────────────────── */
    .agents-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
    }

    .agents-table th {
      text-align: left;
      padding: 0.6rem 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }

    .agents-table td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .agents-table tbody tr {
      cursor: pointer;
      transition: background 0.1s;
    }

    .agents-table tbody tr:hover { background: rgba(88, 166, 255, 0.04); }

    .agent-edit-panel {
      display: none;
      background: var(--bg-input);
      border-bottom: 1px solid var(--border);
    }

    .agent-edit-panel.open { display: table-row; }

    .edit-panel-inner {
      padding: 1.25rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }

    .edit-section h4 {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 0.75rem;
    }

    .inline-fields {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.5rem;
    }

    .inline-fields-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .mini-progress {
      margin-top: 0.75rem;
    }

    .mini-progress .progress-bar { height: 5px; }

    .mini-progress .progress-header {
      font-size: 0.7rem;
    }

    /* ── API Docs ────────────────────────────────────────────────── */
    #swagger-container { margin-bottom: 2rem; }

    /* Swagger dark overrides */
    .swagger-ui { background: transparent; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: var(--text-heading); }
    .swagger-ui .info p, .swagger-ui .info li { color: var(--text); }
    .swagger-ui .scheme-container { background: var(--bg-card); box-shadow: none; border: 1px solid var(--border); border-radius: var(--radius); }
    .swagger-ui .opblock-tag { color: var(--text-heading); border-bottom-color: var(--border); }
    .swagger-ui .opblock { border-color: var(--border); background: var(--bg-card); }
    .swagger-ui .opblock .opblock-summary { border-color: var(--border); }
    .swagger-ui .opblock .opblock-summary-description { color: var(--text-muted); }
    .swagger-ui .opblock .opblock-section-header { background: var(--bg-input); }
    .swagger-ui .opblock .opblock-section-header h4 { color: var(--text-heading); }
    .swagger-ui .btn { border-radius: 4px; }
    .swagger-ui .model-box { background: var(--bg-input); }
    .swagger-ui .model { color: var(--text); }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: var(--text-muted); border-bottom-color: var(--border); }
    .swagger-ui .parameter__name { color: var(--text); }
    .swagger-ui .parameter__type { color: var(--text-muted); }
    .swagger-ui .response-col_status { color: var(--accent); }
    .swagger-ui section.models { border-color: var(--border); }
    .swagger-ui section.models h4 { color: var(--text-heading); }
    .swagger-ui .model-title { color: var(--text-heading); }

    .mcp-tools-section { margin-top: 2rem; }

    .mcp-tools-section h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 1rem;
    }

    .tool-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
    }

    .tool-card .tool-name {
      font-weight: 700;
      color: var(--accent);
      font-size: 0.9rem;
      font-family: "SFMono-Regular", Consolas, monospace;
    }

    .tool-card .tool-desc {
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-top: 0.3rem;
    }

    /* ── Responsive ──────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar {
        width: 100%;
        min-width: 100%;
        position: relative;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .sidebar-nav { display: flex; overflow-x: auto; padding: 0; }
      .sidebar-nav a { border-left: none; border-bottom: 3px solid transparent; white-space: nowrap; }
      .sidebar-nav a.active { border-left-color: transparent; border-bottom-color: var(--accent); }
      .app-layout { flex-direction: column; }
      .content { margin-left: 0; padding: 1rem; }
      .charts-grid { grid-template-columns: 1fr; }
      .health-grid { grid-template-columns: repeat(2, 1fr); }
      .edit-panel-inner { grid-template-columns: 1fr; }
      .inline-fields { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <!-- ── Login Overlay ──────────────────────────────────────── -->
  <div id="login-overlay">
    <div class="login-box">
      <h1>Butt-Dial Admin</h1>
      <p>Enter your master security token to continue.</p>
      <form id="login-form" autocomplete="off">
        <input type="password" id="login-token" placeholder="Master Token" autofocus>
        <button type="submit">Sign In</button>
      </form>
      <div class="login-error" id="login-error"></div>
    </div>
  </div>

  <!-- ── Demo Banner ────────────────────────────────────────── -->
  <div id="demo-banner">DEMO MODE &mdash; All API calls use mock providers. No real messages are sent.</div>

  <!-- ── App Layout ─────────────────────────────────────────── -->
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <h2>Butt-Dial</h2>
        <span>Communication Server</span>
      </div>
      <nav class="sidebar-nav">
        <a href="#dashboard" data-tab="dashboard" class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>
          </svg>
          Dashboard
        </a>
        <a href="#settings" data-tab="settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Settings
        </a>
        <a href="#agents" data-tab="agents">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Agents
        </a>
        <a href="#docs" data-tab="docs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          API Docs
        </a>
        <a href="#simulator" data-tab="simulator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Simulator
        </a>
      </nav>
      <div class="sidebar-bottom">
        <button id="logout-btn">Sign Out</button>
      </div>
    </aside>

    <!-- Content -->
    <main class="content">
      <!-- ── Dashboard Tab ────────────────────────────────────── -->
      <div id="tab-dashboard" class="tab-content active">
        <h1 class="page-title">Dashboard</h1>

        <div class="health-grid">
          <div class="health-card">
            <div class="big-number" id="stat-uptime">--</div>
            <div class="card-label">Uptime</div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-agents">0</div>
            <div class="card-label">Active Agents</div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-messages">0</div>
            <div class="card-label">Total Messages</div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-cost">$0.00</div>
            <div class="card-label">Total Cost</div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3>Messages Over Time</h3>
            <div class="chart-wrapper">
              <canvas id="messages-chart"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <h3>Cost by Channel</h3>
            <div class="chart-wrapper">
              <canvas id="cost-chart"></canvas>
            </div>
          </div>
        </div>

        <div class="card progress-section">
          <div class="card-header">
            <span class="card-title">Usage vs Limits</span>
          </div>
          <div class="progress-item">
            <div class="progress-header">
              <span class="label">Actions Today</span>
              <span class="value" id="usage-actions">0 / 500</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" id="fill-actions" style="width:0%"></div></div>
          </div>
          <div class="progress-item">
            <div class="progress-header">
              <span class="label">Spend Today</span>
              <span class="value" id="usage-spend-day">$0.00 / $10.00</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" id="fill-spend-day" style="width:0%"></div></div>
          </div>
          <div class="progress-item">
            <div class="progress-header">
              <span class="label">Spend This Month</span>
              <span class="value" id="usage-spend-month">$0.00 / $100.00</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" id="fill-spend-month" style="width:0%"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Alerts</span>
            <button class="btn btn-sm btn-secondary" onclick="loadDashboard()">Refresh</button>
          </div>
          <table class="alerts-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Message</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody id="alerts-body">
              <tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:1rem;">No alerts</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Settings Tab ─────────────────────────────────────── -->
      <div id="tab-settings" class="tab-content">
        <h1 class="page-title">Settings</h1>

        <!-- Communications Group -->
        <div class="group-heading">Communications</div>

        <div class="card" id="card-twilio">
          <div class="card-header">
            <span class="card-title">Twilio</span>
            <span class="badge badge-info" id="twilio-badge">--</span>
          </div>
          <div class="card-desc">SMS, WhatsApp, and Voice calls via Twilio.</div>
          <div class="field">
            <label>Account SID</label>
            <input type="text" id="twilio-sid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
          </div>
          <div class="field">
            <label>Auth Token</label>
            <input type="password" id="twilio-token" placeholder="Your Twilio auth token">
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-secondary" onclick="testTwilio()">Test Connection</button>
            <button class="btn btn-sm btn-primary" onclick="saveComms()">Save</button>
            <span class="test-result" id="twilio-result"></span>
          </div>
        </div>

        <div class="card" id="card-resend">
          <div class="card-header">
            <span class="card-title">Resend</span>
            <span class="badge badge-info" id="resend-badge">--</span>
          </div>
          <div class="card-desc">Email sending via Resend.</div>
          <div class="field">
            <label>API Key</label>
            <input type="password" id="resend-key" placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-secondary" onclick="testResend()">Test Connection</button>
            <button class="btn btn-sm btn-primary" onclick="saveComms()">Save</button>
            <span class="test-result" id="resend-result"></span>
          </div>
        </div>

        <!-- Voice & TTS Group -->
        <div class="group-heading">Voice &amp; TTS</div>

        <div class="card" id="card-tts">
          <div class="card-header">
            <span class="card-title">Text-to-Speech</span>
            <span class="badge badge-info" id="tts-badge">--</span>
          </div>
          <div class="card-desc">Voice synthesis provider for outbound calls.</div>
          <div class="field">
            <label>TTS Provider</label>
            <select id="tts-provider" onchange="onTtsProviderChange()">
              <option value="elevenlabs">ElevenLabs</option>
              <option value="edge-tts">Edge TTS (free)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div class="field conditional-field" id="field-elevenlabs-key">
            <label>ElevenLabs API Key</label>
            <input type="password" id="elevenlabs-key" placeholder="Your ElevenLabs API key">
          </div>
          <div class="field conditional-field" id="field-openai-key">
            <label>OpenAI API Key</label>
            <input type="password" id="openai-key" placeholder="sk-...">
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-secondary" onclick="testTts()">Test Connection</button>
            <span class="test-result" id="tts-result"></span>
          </div>
        </div>

        <div class="card" id="card-voice">
          <div class="card-header">
            <span class="card-title">Voice Configuration</span>
          </div>
          <div class="field">
            <label>Voice</label>
            <select id="voice-select">
              <option value="">Loading voices...</option>
            </select>
          </div>
          <div class="field">
            <label>Greeting</label>
            <textarea id="voice-greeting" placeholder="Hello! How can I help you today?"></textarea>
          </div>
          <div class="field">
            <label>System Prompt</label>
            <textarea id="voice-prompt" placeholder="You are a helpful assistant..."></textarea>
          </div>
          <div class="field">
            <label>Language</label>
            <select id="voice-language">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish (Spain)</option>
              <option value="es-MX">Spanish (Mexico)</option>
              <option value="fr-FR">French (France)</option>
              <option value="de-DE">German</option>
              <option value="it-IT">Italian</option>
              <option value="pt-BR">Portuguese (Brazil)</option>
              <option value="ja-JP">Japanese</option>
              <option value="ko-KR">Korean</option>
              <option value="zh-CN">Chinese (Mandarin)</option>
              <option value="ar-SA">Arabic</option>
              <option value="hi-IN">Hindi</option>
              <option value="nl-NL">Dutch</option>
              <option value="pl-PL">Polish</option>
              <option value="ru-RU">Russian</option>
              <option value="sv-SE">Swedish</option>
              <option value="tr-TR">Turkish</option>
            </select>
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-primary" onclick="saveVoice()">Save</button>
          </div>
        </div>

        <!-- Server Group -->
        <div class="group-heading">Server</div>

        <div class="card" id="card-server">
          <div class="card-header">
            <span class="card-title">Server Configuration</span>
          </div>
          <div class="field">
            <label>Webhook Base URL</label>
            <input type="text" id="server-webhook" placeholder="https://your-domain.com">
          </div>
          <div class="field">
            <label>Master Security Token</label>
            <input type="password" id="server-token" placeholder="A strong secret token">
          </div>
          <div class="field">
            <label>Identity Mode</label>
            <select id="server-identity">
              <option value="dedicated">Dedicated</option>
              <option value="shared">Shared</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div class="field">
            <label>Isolation Mode</label>
            <select id="server-isolation">
              <option value="single-account">Single Account</option>
              <option value="per-agent-subaccount">Per Agent Subaccount</option>
              <option value="per-customer-subaccount">Per Customer Subaccount</option>
            </select>
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-primary" onclick="saveServer()">Save</button>
          </div>
        </div>

        <div style="margin-top: 1.5rem;">
          <button class="btn btn-success" id="deploy-btn" onclick="deploy()">Deploy Changes</button>
          <span id="deploy-result" style="margin-left:0.75rem;font-size:0.85rem;"></span>
        </div>
      </div>

      <!-- ── Agents Tab ───────────────────────────────────────── -->
      <div id="tab-agents" class="tab-content">
        <h1 class="page-title">Agents</h1>
        <div class="card">
          <table class="agents-table" id="agents-table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody id="agents-body">
              <tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:1.5rem;">Loading agents...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── API Docs Tab ─────────────────────────────────────── -->
      <div id="tab-docs" class="tab-content">
        <h1 class="page-title">API Documentation</h1>
        <div id="swagger-container"></div>
        <div class="mcp-tools-section">
          <h3>MCP Tools Reference</h3>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;">
            These tools are accessed via the MCP protocol over the <code>/sse</code> endpoint, not REST. Connect with any MCP client to use them.
          </p>
          <div id="mcp-tools"></div>
        </div>
      </div>

      <!-- ── Simulator Tab ─────────────────────────────────────── -->
      <div id="tab-simulator" class="tab-content">
        <h1 class="page-title">Simulator</h1>
        ${renderSimulatorTab()}
      </div>
    </main>
  </div>

  <!-- ── Chart.js CDN ────────────────────────────────────────── -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>

  <script>
    /* ── Globals ──────────────────────────────────────────────── */
    const API_SPEC = ${specJson};
    let messagesChart = null;
    let costChart = null;
    let dashboardTimer = null;
    let swaggerLoaded = false;
    let tierPresets = {};

    /* ── Auth helpers ─────────────────────────────────────────── */
    function getToken() {
      return sessionStorage.getItem('adminToken') || '';
    }

    function authHeaders() {
      return {
        'Authorization': 'Bearer ' + getToken(),
        'Content-Type': 'application/json'
      };
    }

    async function apiFetch(url, opts = {}) {
      const defaults = { headers: authHeaders() };
      const merged = { ...defaults, ...opts, headers: { ...defaults.headers, ...(opts.headers || {}) } };
      return fetch(url, merged);
    }

    /* ── Login ────────────────────────────────────────────────── */
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    const loginTokenInput = document.getElementById('login-token');
    const loginError = document.getElementById('login-error');

    async function attemptLogin(token) {
      try {
        const res = await fetch('/admin/api/status', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          sessionStorage.setItem('adminToken', token);
          loginOverlay.classList.add('hidden');
          onAuthenticated();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = loginTokenInput.value.trim();
      if (!token) {
        loginError.textContent = 'Please enter a token.';
        return;
      }
      loginError.textContent = 'Signing in...';
      const ok = await attemptLogin(token);
      if (!ok) {
        loginError.textContent = 'Invalid token or server unreachable.';
      }
    });

    /* Auto-login if session token exists */
    (async () => {
      const saved = getToken();
      if (saved) {
        const ok = await attemptLogin(saved);
        if (!ok) {
          sessionStorage.removeItem('adminToken');
        }
      }
    })();

    /* ── Logout ───────────────────────────────────────────────── */
    document.getElementById('logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('adminToken');
      loginOverlay.classList.remove('hidden');
      loginTokenInput.value = '';
      loginError.textContent = '';
      if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; }
    });

    /* ── Tab Routing ──────────────────────────────────────────── */
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(tabId) {
      tabContents.forEach(t => t.classList.remove('active'));
      navLinks.forEach(l => l.classList.remove('active'));

      const content = document.getElementById('tab-' + tabId);
      const link = document.querySelector('[data-tab="' + tabId + '"]');
      if (content) content.classList.add('active');
      if (link) link.classList.add('active');

      /* Lazy load swagger on first visit */
      if (tabId === 'docs' && !swaggerLoaded) {
        initSwagger();
      }

      if (tabId === 'agents') {
        loadAgents();
      }

      if (tabId === 'simulator' && typeof initSimulator === 'function') {
        initSimulator();
      }
    }

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-tab');
        history.replaceState(null, '', '#' + tab);
        switchTab(tab);
      });
    });

    /* Read initial hash */
    function getInitialTab() {
      const hash = location.hash.replace('#', '');
      if (['dashboard', 'settings', 'agents', 'docs', 'simulator'].includes(hash)) return hash;
      return 'dashboard';
    }

    window.addEventListener('hashchange', () => {
      switchTab(getInitialTab());
    });

    /* ── On Authenticated ─────────────────────────────────────── */
    async function onAuthenticated() {
      switchTab(getInitialTab());
      await checkDemoMode();
      loadDashboard();
      loadSettingsStatus();
      loadVoices();

      /* Auto-refresh dashboard every 30 seconds */
      if (dashboardTimer) clearInterval(dashboardTimer);
      dashboardTimer = setInterval(loadDashboard, 30000);
    }

    /* ── Demo Mode Check ──────────────────────────────────────── */
    async function checkDemoMode() {
      try {
        const res = await apiFetch('/admin/api/status');
        const data = await res.json();
        if (data.demoMode) {
          document.getElementById('demo-banner').classList.add('visible');
        }
      } catch {}
    }

    /* ── Dashboard ────────────────────────────────────────────── */
    async function loadDashboard() {
      try {
        const [dashRes, histRes, healthRes] = await Promise.all([
          apiFetch('/admin/api/dashboard'),
          apiFetch('/admin/api/usage-history'),
          fetch('/health')
        ]);

        const dash = await dashRes.json();
        const hist = await histRes.json();
        let health = {};
        try { health = await healthRes.json(); } catch {}

        /* Uptime */
        const uptimeSec = health.uptime || 0;
        const hours = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        document.getElementById('stat-uptime').textContent =
          hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';

        /* Health cards */
        const agents = dash.agents || [];
        const activeCount = agents.filter(a => a.status === 'active' || a.status === 'ACTIVE').length;
        document.getElementById('stat-agents').textContent = activeCount || agents.length;
        document.getElementById('stat-messages').textContent = (dash.usage?.totalMessages || 0).toLocaleString();
        document.getElementById('stat-cost').textContent = '$' + (dash.usage?.totalCost || 0).toFixed(2);

        /* Progress bars */
        const actionsToday = dash.usage?.todayActions || 0;
        const actionsLimit = 500;
        const actionsPct = Math.min(100, (actionsToday / actionsLimit) * 100);
        document.getElementById('usage-actions').textContent = actionsToday + ' / ' + actionsLimit;
        const fillActions = document.getElementById('fill-actions');
        fillActions.style.width = actionsPct + '%';
        fillActions.className = 'progress-fill' + (actionsPct > 90 ? ' danger' : actionsPct > 70 ? ' warn' : '');

        const spendDay = dash.usage?.totalCost || 0;
        const spendDayLimit = 10;
        const spendDayPct = Math.min(100, (spendDay / spendDayLimit) * 100);
        document.getElementById('usage-spend-day').textContent = '$' + spendDay.toFixed(2) + ' / $' + spendDayLimit.toFixed(2);
        const fillSpendDay = document.getElementById('fill-spend-day');
        fillSpendDay.style.width = spendDayPct + '%';
        fillSpendDay.className = 'progress-fill' + (spendDayPct > 90 ? ' danger' : spendDayPct > 70 ? ' warn' : '');

        const spendMonth = dash.usage?.totalCost || 0;
        const spendMonthLimit = 100;
        const spendMonthPct = Math.min(100, (spendMonth / spendMonthLimit) * 100);
        document.getElementById('usage-spend-month').textContent = '$' + spendMonth.toFixed(2) + ' / $' + spendMonthLimit.toFixed(2);
        const fillSpendMonth = document.getElementById('fill-spend-month');
        fillSpendMonth.style.width = spendMonthPct + '%';
        fillSpendMonth.className = 'progress-fill' + (spendMonthPct > 90 ? ' danger' : spendMonthPct > 70 ? ' warn' : '');

        /* Alerts table */
        const alertsBody = document.getElementById('alerts-body');
        const alerts = dash.alerts || [];
        if (alerts.length === 0) {
          alertsBody.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:1rem;">No recent alerts</td></tr>';
        } else {
          alertsBody.innerHTML = alerts.map(a => {
            const sev = (a.severity || 'INFO').toUpperCase();
            const ts = a.timestamp ? new Date(a.timestamp).toLocaleString() : '--';
            return '<tr>' +
              '<td><span class="severity-badge severity-' + sev + '">' + sev + '</span></td>' +
              '<td>' + escHtml(a.message || '') + '</td>' +
              '<td style="color:var(--text-muted);white-space:nowrap;">' + ts + '</td>' +
              '</tr>';
          }).join('');
        }

        /* Charts */
        renderMessagesChart(hist.messagesByDay || []);
        renderCostChart(hist.costByChannel || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    }

    /* ── Charts ───────────────────────────────────────────────── */
    const chartColors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#f78166', '#79c0ff'];

    function renderMessagesChart(data) {
      const ctx = document.getElementById('messages-chart');
      if (!ctx) return;

      /* Group by day, aggregate per channel */
      const days = [...new Set(data.map(d => d.day))].sort();
      const channels = [...new Set(data.map(d => d.channel || 'unknown'))];
      const datasets = channels.map((ch, i) => {
        const color = chartColors[i % chartColors.length];
        return {
          label: ch,
          data: days.map(day => {
            const row = data.find(d => d.day === day && (d.channel || 'unknown') === ch);
            return row ? row.count : 0;
          }),
          borderColor: color,
          backgroundColor: color + '33',
          tension: 0.3,
          fill: true,
          pointRadius: 3
        };
      });

      if (messagesChart) messagesChart.destroy();
      messagesChart = new Chart(ctx, {
        type: 'line',
        data: { labels: days.map(d => d.slice(5)), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
            y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' }, beginAtZero: true }
          }
        }
      });
    }

    function renderCostChart(data) {
      const ctx = document.getElementById('cost-chart');
      if (!ctx) return;

      const labels = data.map(d => d.channel || 'unknown');
      const values = data.map(d => parseFloat(d.total_cost) || 0);

      if (costChart) costChart.destroy();

      if (values.length === 0 || values.every(v => v === 0)) {
        costChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['No data'],
            datasets: [{ data: [1], backgroundColor: ['#21262d'], borderWidth: 0 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } }
          }
        });
        return;
      }

      costChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: chartColors.slice(0, labels.length),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom', labels: { color: '#8b949e', font: { size: 11 }, padding: 12 } } }
        }
      });
    }

    /* ── Settings: Load Status ────────────────────────────────── */
    async function loadSettingsStatus() {
      try {
        const res = await apiFetch('/admin/api/status');
        const status = await res.json();

        /* Update badges */
        setBadge('twilio-badge', status.twilio?.configured);
        setBadge('resend-badge', status.resend?.configured);
        setBadge('tts-badge', status.tts?.configured);

        /* Pre-fill masked values */
        if (status.twilio?.accountSid) {
          document.getElementById('twilio-sid').placeholder = status.twilio.accountSid;
        }
        if (status.server?.webhookBaseUrl) {
          document.getElementById('server-webhook').placeholder = status.server.webhookBaseUrl;
        }
        if (status.tts?.provider) {
          document.getElementById('tts-provider').value = status.tts.provider;
          onTtsProviderChange();
        }
        if (status.voice?.voice) {
          /* Will be applied after voices load */
          document.getElementById('voice-select').dataset.preselect = status.voice.voice;
        }
        if (status.voice?.greeting) {
          document.getElementById('voice-greeting').value = status.voice.greeting;
        }
        if (status.voice?.systemPrompt) {
          document.getElementById('voice-prompt').value = status.voice.systemPrompt;
        }
        if (status.voice?.language) {
          document.getElementById('voice-language').value = status.voice.language;
        }
        if (status.server?.identityMode) {
          document.getElementById('server-identity').value = status.server.identityMode;
        }
        if (status.server?.isolationMode) {
          document.getElementById('server-isolation').value = status.server.isolationMode;
        }
      } catch (err) {
        console.error('Status load error:', err);
      }
    }

    function setBadge(id, configured) {
      const el = document.getElementById(id);
      if (!el) return;
      if (configured === true) {
        el.textContent = 'Configured';
        el.className = 'badge badge-success';
      } else if (configured === false) {
        el.textContent = 'Not Set';
        el.className = 'badge badge-error';
      } else {
        el.textContent = '--';
        el.className = 'badge badge-info';
      }
    }

    /* ── Settings: TTS Provider Toggle ────────────────────────── */
    function onTtsProviderChange() {
      const provider = document.getElementById('tts-provider').value;
      const elField = document.getElementById('field-elevenlabs-key');
      const oaiField = document.getElementById('field-openai-key');

      elField.classList.toggle('visible', provider === 'elevenlabs');
      oaiField.classList.toggle('visible', provider === 'openai');
    }

    /* Init on load */
    onTtsProviderChange();

    /* ── Settings: Load Voices ────────────────────────────────── */
    const RECOMMENDED_VOICES = {
      '21m00Tcm4TlvDq8ikWAM': { name: 'Rachel', gender: 'female' },
      'pNInz6obpgDQGcFmaJgB': { name: 'Adam', gender: 'male' }
    };

    async function loadVoices() {
      try {
        const res = await apiFetch('/admin/api/voices');
        const data = await res.json();
        const voices = data.voices || [];
        const select = document.getElementById('voice-select');

        if (voices.length === 0) {
          select.innerHTML = '<option value="">No voices available</option>';
          return;
        }

        /* Categorize voices by gender */
        const male = [];
        const female = [];
        const other = [];

        voices.forEach(v => {
          const id = v.voice_id || v.id || '';
          const name = v.name || id;
          const gender = (v.labels?.gender || v.gender || '').toLowerCase();
          const isRecommended = RECOMMENDED_VOICES[id];
          const displayName = name + (isRecommended ? ' (Recommended)' : '');
          const entry = { id, displayName, name };

          if (gender === 'female') female.push(entry);
          else if (gender === 'male') male.push(entry);
          else other.push(entry);
        });

        let html = '';
        if (female.length > 0) {
          html += '<optgroup label="Female">';
          female.forEach(v => { html += '<option value="' + escAttr(v.id) + '">' + escHtml(v.displayName) + '</option>'; });
          html += '</optgroup>';
        }
        if (male.length > 0) {
          html += '<optgroup label="Male">';
          male.forEach(v => { html += '<option value="' + escAttr(v.id) + '">' + escHtml(v.displayName) + '</option>'; });
          html += '</optgroup>';
        }
        if (other.length > 0) {
          html += '<optgroup label="Other">';
          other.forEach(v => { html += '<option value="' + escAttr(v.id) + '">' + escHtml(v.displayName) + '</option>'; });
          html += '</optgroup>';
        }

        select.innerHTML = html;

        /* Apply preselected voice */
        const preselect = select.dataset.preselect;
        if (preselect) {
          select.value = preselect;
        }
      } catch (err) {
        console.error('Voice load error:', err);
        document.getElementById('voice-select').innerHTML = '<option value="">Failed to load voices</option>';
      }
    }

    /* ── Settings: Test Connections ────────────────────────────── */
    async function testTwilio() {
      const resultEl = document.getElementById('twilio-result');
      resultEl.className = 'test-result';
      resultEl.textContent = 'Testing...';

      try {
        const res = await apiFetch('/admin/api/test/twilio', {
          method: 'POST',
          body: JSON.stringify({
            accountSid: document.getElementById('twilio-sid').value,
            authToken: document.getElementById('twilio-token').value
          })
        });
        const data = await res.json();
        resultEl.className = 'test-result ' + (data.success ? 'success' : 'error');
        resultEl.innerHTML = (data.success ? '&#10003; ' : '&#10007; ') + escHtml(data.message || (data.success ? 'Connected' : 'Failed'));
      } catch (err) {
        resultEl.className = 'test-result error';
        resultEl.textContent = '&#10007; Network error';
      }
    }

    async function testResend() {
      const resultEl = document.getElementById('resend-result');
      resultEl.className = 'test-result';
      resultEl.textContent = 'Testing...';

      try {
        const res = await apiFetch('/admin/api/test/resend', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: document.getElementById('resend-key').value
          })
        });
        const data = await res.json();
        resultEl.className = 'test-result ' + (data.success ? 'success' : 'error');
        resultEl.innerHTML = (data.success ? '&#10003; ' : '&#10007; ') + escHtml(data.message || (data.success ? 'Connected' : 'Failed'));
      } catch (err) {
        resultEl.className = 'test-result error';
        resultEl.textContent = '&#10007; Network error';
      }
    }

    async function testTts() {
      const resultEl = document.getElementById('tts-result');
      resultEl.className = 'test-result';
      resultEl.textContent = 'Testing...';

      const provider = document.getElementById('tts-provider').value;
      let endpoint = '/admin/api/test/elevenlabs';
      let body = {};

      if (provider === 'elevenlabs') {
        endpoint = '/admin/api/test/elevenlabs';
        body = { apiKey: document.getElementById('elevenlabs-key').value };
      } else if (provider === 'openai') {
        /* If an OpenAI test endpoint exists, use it; otherwise generic */
        endpoint = '/admin/api/test/elevenlabs';
        body = { apiKey: document.getElementById('openai-key').value };
      } else {
        /* Edge TTS is free, no test needed */
        resultEl.className = 'test-result success';
        resultEl.innerHTML = '&#10003; Edge TTS is free — no key needed';
        return;
      }

      try {
        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        const data = await res.json();
        resultEl.className = 'test-result ' + (data.success ? 'success' : 'error');
        resultEl.innerHTML = (data.success ? '&#10003; ' : '&#10007; ') + escHtml(data.message || (data.success ? 'Connected' : 'Failed'));
      } catch (err) {
        resultEl.className = 'test-result error';
        resultEl.textContent = '&#10007; Network error';
      }
    }

    /* ── Settings: Save ───────────────────────────────────────── */
    async function saveComms() {
      const credentials = {};
      const sid = document.getElementById('twilio-sid').value.trim();
      const token = document.getElementById('twilio-token').value.trim();
      const resendKey = document.getElementById('resend-key').value.trim();

      if (sid) credentials.TWILIO_ACCOUNT_SID = sid;
      if (token) credentials.TWILIO_AUTH_TOKEN = token;
      if (resendKey) credentials.RESEND_API_KEY = resendKey;

      if (Object.keys(credentials).length === 0) {
        alert('Enter at least one credential to save.');
        return;
      }

      await doSave(credentials);
    }

    async function saveVoice() {
      const credentials = {};
      const provider = document.getElementById('tts-provider').value;
      const voice = document.getElementById('voice-select').value;
      const greeting = document.getElementById('voice-greeting').value.trim();
      const prompt = document.getElementById('voice-prompt').value.trim();
      const language = document.getElementById('voice-language').value;

      credentials.PROVIDER_TTS = provider;
      if (voice) credentials.VOICE_DEFAULT_VOICE = voice;
      if (greeting) credentials.VOICE_DEFAULT_GREETING = greeting;
      if (prompt) credentials.VOICE_DEFAULT_SYSTEM_PROMPT = prompt;
      if (language) credentials.VOICE_DEFAULT_LANGUAGE = language;

      if (provider === 'elevenlabs') {
        const key = document.getElementById('elevenlabs-key').value.trim();
        if (key) credentials.ELEVENLABS_API_KEY = key;
      } else if (provider === 'openai') {
        const key = document.getElementById('openai-key').value.trim();
        if (key) credentials.OPENAI_API_KEY = key;
      }

      await doSave(credentials);
    }

    async function saveServer() {
      const credentials = {};
      const webhook = document.getElementById('server-webhook').value.trim();
      const token = document.getElementById('server-token').value.trim();
      const identity = document.getElementById('server-identity').value;
      const isolation = document.getElementById('server-isolation').value;

      if (webhook) credentials.WEBHOOK_BASE_URL = webhook;
      if (token) credentials.MASTER_SECURITY_TOKEN = token;
      if (identity) credentials.IDENTITY_MODE = identity;
      if (isolation) credentials.ISOLATION_MODE = isolation;

      if (Object.keys(credentials).length === 0) {
        alert('Enter at least one setting to save.');
        return;
      }

      await doSave(credentials);
    }

    async function doSave(credentials) {
      try {
        const res = await apiFetch('/admin/api/save', {
          method: 'POST',
          body: JSON.stringify({ credentials })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Saved successfully', 'success');
          loadSettingsStatus();
        } else {
          showToast(data.message || 'Save failed', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      }
    }

    /* ── Deploy ───────────────────────────────────────────────── */
    async function deploy() {
      const btn = document.getElementById('deploy-btn');
      const resultEl = document.getElementById('deploy-result');
      btn.disabled = true;
      resultEl.textContent = 'Restarting server...';
      resultEl.style.color = 'var(--warning)';

      try {
        await apiFetch('/admin/api/deploy', { method: 'POST' });
        resultEl.textContent = 'Server is restarting. Page will reload in 5 seconds...';

        setTimeout(() => {
          location.reload();
        }, 5000);
      } catch {
        resultEl.textContent = 'Deploy request sent. Waiting for restart...';
        setTimeout(() => {
          location.reload();
        }, 5000);
      }
    }

    /* ── Agents ───────────────────────────────────────────────── */
    let agentsData = [];

    async function loadAgents() {
      try {
        const res = await apiFetch('/admin/api/agents');
        const data = await res.json();
        agentsData = data.agents || [];
        tierPresets = {};

        /* Build tier presets map */
        const tiers = data.tiers || [];
        tiers.forEach(t => {
          tierPresets[t.name || t.tier] = t;
        });

        renderAgentsTable();
      } catch (err) {
        console.error('Agents load error:', err);
        document.getElementById('agents-body').innerHTML =
          '<tr><td colspan="6" style="color:var(--error);text-align:center;padding:1.5rem;">Failed to load agents</td></tr>';
      }
    }

    function renderAgentsTable() {
      const body = document.getElementById('agents-body');

      if (agentsData.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:1.5rem;">No agents found</td></tr>';
        return;
      }

      let html = '';
      agentsData.forEach((agent, idx) => {
        const agentId = agent.agent_id || '--';
        const name = agent.display_name || '--';
        const phone = agent.phone_number || '--';
        const email = agent.email_address || '--';
        const status = agent.status || 'unknown';
        const tier = agent.billing?.tier || 'free';
        const limits = agent.limits || {};
        const billing = agent.billing || {};

        const statusBadge = status === 'active' || status === 'ACTIVE'
          ? '<span class="badge badge-success">Active</span>'
          : '<span class="badge badge-warning">' + escHtml(status) + '</span>';

        html += '<tr onclick="toggleAgentEdit(' + idx + ')" data-agent-idx="' + idx + '">' +
          '<td style="font-family:monospace;font-size:0.8rem;">' + escHtml(agentId) + '</td>' +
          '<td>' + escHtml(name) + '</td>' +
          '<td>' + escHtml(phone) + '</td>' +
          '<td>' + escHtml(email) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td><span class="badge badge-info">' + escHtml(tier) + '</span></td>' +
          '</tr>';

        /* Edit panel row */
        html += '<tr class="agent-edit-panel" id="agent-edit-' + idx + '">' +
          '<td colspan="6">' +
          '<div class="edit-panel-inner">' +
          /* Left: Rate Limits */
          '<div class="edit-section">' +
          '<h4>Rate Limits</h4>' +
          '<div class="inline-fields">' +
          '<div class="field"><label>Per Minute</label><input type="number" id="limit-min-' + idx + '" value="' + (limits.max_actions_per_minute || 10) + '"></div>' +
          '<div class="field"><label>Per Hour</label><input type="number" id="limit-hour-' + idx + '" value="' + (limits.max_actions_per_hour || 100) + '"></div>' +
          '<div class="field"><label>Per Day</label><input type="number" id="limit-day-' + idx + '" value="' + (limits.max_actions_per_day || 500) + '"></div>' +
          '</div>' +
          '<div class="inline-fields-2" style="margin-top:0.5rem;">' +
          '<div class="field"><label>Spend / Day ($)</label><input type="number" step="0.01" id="spend-day-' + idx + '" value="' + (limits.max_spend_per_day || 10) + '"></div>' +
          '<div class="field"><label>Spend / Month ($)</label><input type="number" step="0.01" id="spend-month-' + idx + '" value="' + (limits.max_spend_per_month || 100) + '"></div>' +
          '</div>' +
          '<div style="margin-top:0.75rem;"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveLimits(\'' + escAttr(agentId) + '\',' + idx + ')">Save Limits</button></div>' +
          '</div>' +
          /* Right: Billing */
          '<div class="edit-section">' +
          '<h4>Billing</h4>' +
          '<div class="field"><label>Tier</label>' +
          '<select id="tier-' + idx + '" onchange="event.stopPropagation();onTierChange(' + idx + ')">' +
          '<option value="free"' + (tier === 'free' ? ' selected' : '') + '>Free</option>' +
          '<option value="starter"' + (tier === 'starter' ? ' selected' : '') + '>Starter</option>' +
          '<option value="pro"' + (tier === 'pro' ? ' selected' : '') + '>Pro</option>' +
          '<option value="enterprise"' + (tier === 'enterprise' ? ' selected' : '') + '>Enterprise</option>' +
          '</select></div>' +
          '<div class="inline-fields-2">' +
          '<div class="field"><label>Markup %</label><input type="number" step="0.1" id="markup-' + idx + '" value="' + (billing.markupPercent || 0) + '"></div>' +
          '<div class="field"><label>Billing Email</label><input type="email" id="billing-email-' + idx + '" value="' + escAttr(billing.billingEmail || '') + '"></div>' +
          '</div>' +
          '<div style="margin-top:0.75rem;"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveBilling(\'' + escAttr(agentId) + '\',' + idx + ')">Save Billing</button></div>' +
          /* Mini progress bars */
          '<div class="mini-progress">' +
          buildMiniProgress('Actions/day', limits.max_actions_per_day || 500, 0) +
          buildMiniProgress('Spend/day', limits.max_spend_per_day || 10, 0) +
          '</div>' +
          '</div>' +
          '</div>' +
          '</td>' +
          '</tr>';
      });

      body.innerHTML = html;
    }

    function buildMiniProgress(label, max, current) {
      const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
      return '<div class="progress-item" style="margin-bottom:0.4rem;">' +
        '<div class="progress-header"><span class="label">' + escHtml(label) + '</span><span class="value">' + current + ' / ' + max + '</span></div>' +
        '<div class="progress-bar" style="height:5px;"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
    }

    function toggleAgentEdit(idx) {
      const panel = document.getElementById('agent-edit-' + idx);
      if (panel) {
        panel.classList.toggle('open');
      }
    }

    function onTierChange(idx) {
      const tierValue = document.getElementById('tier-' + idx).value;
      const preset = tierPresets[tierValue];
      if (!preset) return;

      /* Auto-fill limits from tier presets */
      if (preset.maxActionsPerMinute !== undefined) document.getElementById('limit-min-' + idx).value = preset.maxActionsPerMinute;
      if (preset.maxActionsPerHour !== undefined) document.getElementById('limit-hour-' + idx).value = preset.maxActionsPerHour;
      if (preset.maxActionsPerDay !== undefined) document.getElementById('limit-day-' + idx).value = preset.maxActionsPerDay;
      if (preset.maxSpendPerDay !== undefined) document.getElementById('spend-day-' + idx).value = preset.maxSpendPerDay;
      if (preset.maxSpendPerMonth !== undefined) document.getElementById('spend-month-' + idx).value = preset.maxSpendPerMonth;

      /* Also check snake_case variants */
      if (preset.max_actions_per_minute !== undefined) document.getElementById('limit-min-' + idx).value = preset.max_actions_per_minute;
      if (preset.max_actions_per_hour !== undefined) document.getElementById('limit-hour-' + idx).value = preset.max_actions_per_hour;
      if (preset.max_actions_per_day !== undefined) document.getElementById('limit-day-' + idx).value = preset.max_actions_per_day;
      if (preset.max_spend_per_day !== undefined) document.getElementById('spend-day-' + idx).value = preset.max_spend_per_day;
      if (preset.max_spend_per_month !== undefined) document.getElementById('spend-month-' + idx).value = preset.max_spend_per_month;
    }

    async function saveLimits(agentId, idx) {
      try {
        const res = await apiFetch('/admin/api/agents/' + encodeURIComponent(agentId) + '/limits', {
          method: 'POST',
          body: JSON.stringify({
            maxActionsPerMinute: parseInt(document.getElementById('limit-min-' + idx).value) || 10,
            maxActionsPerHour: parseInt(document.getElementById('limit-hour-' + idx).value) || 100,
            maxActionsPerDay: parseInt(document.getElementById('limit-day-' + idx).value) || 500,
            maxSpendPerDay: parseFloat(document.getElementById('spend-day-' + idx).value) || 10,
            maxSpendPerMonth: parseFloat(document.getElementById('spend-month-' + idx).value) || 100
          })
        });
        const data = await res.json();
        showToast(data.success ? 'Limits saved' : (data.error || 'Failed'), data.success ? 'success' : 'error');
      } catch {
        showToast('Network error', 'error');
      }
    }

    async function saveBilling(agentId, idx) {
      try {
        const res = await apiFetch('/admin/api/agents/' + encodeURIComponent(agentId) + '/billing', {
          method: 'POST',
          body: JSON.stringify({
            tier: document.getElementById('tier-' + idx).value,
            markupPercent: parseFloat(document.getElementById('markup-' + idx).value) || 0,
            billingEmail: document.getElementById('billing-email-' + idx).value.trim()
          })
        });
        const data = await res.json();
        showToast(data.success ? 'Billing saved' : (data.error || 'Failed'), data.success ? 'success' : 'error');
        if (data.success) loadAgents();
      } catch {
        showToast('Network error', 'error');
      }
    }

    /* ── Swagger UI ───────────────────────────────────────────── */
    function initSwagger() {
      if (swaggerLoaded) return;
      swaggerLoaded = true;

      try {
        SwaggerUIBundle({
          spec: API_SPEC,
          dom_id: '#swagger-container',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout'
        });
      } catch (err) {
        document.getElementById('swagger-container').innerHTML =
          '<div class="card" style="color:var(--error);">Failed to load Swagger UI: ' + escHtml(String(err)) + '</div>';
      }

      /* Render MCP tools */
      const toolsContainer = document.getElementById('mcp-tools');
      const tools = API_SPEC['x-mcp-tools'] || [];
      if (tools.length === 0) {
        toolsContainer.innerHTML = '<p style="color:var(--text-muted);">No MCP tools found in spec.</p>';
        return;
      }

      toolsContainer.innerHTML = tools.map(function(tool) {
        return '<div class="tool-card">' +
          '<div class="tool-name">' + escHtml(tool.name || '') + '</div>' +
          '<div class="tool-desc">' + escHtml(tool.description || '') + '</div>' +
          '</div>';
      }).join('');
    }

    /* ── Toast Notification ───────────────────────────────────── */
    function showToast(message, type) {
      const existing = document.getElementById('toast-notification');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:0.85rem;font-weight:600;z-index:10000;animation:fadeIn 0.2s;';
      toast.style.background = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--accent)';
      toast.style.color = '#fff';
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    /* ── Utilities ────────────────────────────────────────────── */
    function escHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function escAttr(str) {
      return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  </script>
</body>
</html>`;
}
