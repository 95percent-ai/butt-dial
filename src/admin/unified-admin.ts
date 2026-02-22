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

    /* ── Light Theme ────────────────────────────────────────────── */
    [data-theme="light"] {
      --bg-body: #f5f6f8;
      --bg-sidebar: #ffffff;
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
      --warning: #9a6700;
      --warning-bg: #fff8c5;
      --info: #0969da;
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

    /* ── Disclaimer Modal Overlay ─────────────────────────────── */
    #disclaimer-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      background: rgba(0,0,0,0.85);
      display: none;
      align-items: center;
      justify-content: center;
    }

    #disclaimer-overlay.visible { display: flex; }

    .disclaimer-modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 700px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .disclaimer-modal h1 {
      font-size: 1.5rem;
      color: var(--text-heading);
      margin-bottom: 0.5rem;
      text-align: center;
    }

    .disclaimer-modal .subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .disclaimer-modal h1 { flex-shrink: 0; }
    .disclaimer-modal .subtitle { flex-shrink: 0; }

    .disclaimer-scroll {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      overflow-y: auto;
      margin-bottom: 1.5rem;
      line-height: 1.65;
      font-size: 0.875rem;
      flex: 1 1 auto;
      min-height: 0;
    }

    .disclaimer-scroll h2 {
      font-size: 1rem;
      color: var(--text-heading);
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }

    .disclaimer-scroll h2:first-child { margin-top: 0; }
    .disclaimer-scroll p { margin-bottom: 0.75rem; color: var(--text); }
    .disclaimer-scroll ul { margin-bottom: 0.75rem; padding-left: 1.25rem; }
    .disclaimer-scroll li { margin-bottom: 0.35rem; color: var(--text); }

    .disclaimer-checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 1rem;
      cursor: pointer;
      flex-shrink: 0;
    }

    .disclaimer-checkbox-row input[type="checkbox"] {
      margin-top: 3px;
      accent-color: var(--accent);
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .disclaimer-checkbox-row label {
      font-size: 0.875rem;
      color: var(--text);
      cursor: pointer;
      user-select: none;
    }

    .disclaimer-accept-btn {
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
      flex-shrink: 0;
    }

    .disclaimer-accept-btn:hover:not(:disabled) { background: var(--accent-hover); }
    .disclaimer-accept-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .disclaimer-error {
      background: var(--error-bg);
      color: var(--error);
      padding: 0.75rem 1rem;
      border-radius: var(--radius);
      font-size: 0.85rem;
      margin-bottom: 1rem;
      display: none;
      flex-shrink: 0;
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

    /* ── Org Status Banner ──────────────────────────────────────── */
    #org-banner {
      display: none;
      text-align: center;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 0.8rem;
      letter-spacing: 0.03em;
    }
    #org-banner.visible { display: block; }
    #org-banner.sandbox-pending {
      background: #d29922;
      color: #000;
    }
    #org-banner.sandbox-approved {
      background: var(--accent);
      color: #fff;
    }
    #org-banner.suspended {
      background: var(--error);
      color: #fff;
    }

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
    .badge-error { background: var(--error-bg); color: var(--error); border: 1px solid var(--error); }
    .badge-info { background: rgba(88, 166, 255, 0.1); color: var(--accent); border: 1px solid rgba(88, 166, 255, 0.3); }

    /* ── Dashboard ───────────────────────────────────────────────── */
    .health-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 0.65rem;
      margin-bottom: 1.5rem;
    }

    .health-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.75rem 0.5rem;
      text-align: center;
    }

    .health-card .big-number {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--accent);
      line-height: 1.2;
    }

    .health-card .card-label {
      font-size: 0.65rem;
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

    .chart-empty {
      display: none;
      align-items: center;
      justify-content: center;
      min-height: 180px;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 500;
    }

    .chart-empty.visible {
      display: flex;
    }

    .chart-wrapper canvas.hidden-chart {
      display: none;
    }

    /* ── Analytics Section ─────────────────────────────────────── */
    .analytics-row {
      display: grid;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .analytics-row-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .analytics-row-2 {
      grid-template-columns: 1fr 1fr;
    }

    .analytics-big-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 180px;
    }

    .analytics-big-stat .big-value {
      font-size: 2.5rem;
      font-weight: 800;
      color: var(--success);
      line-height: 1;
    }

    .analytics-big-stat .big-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.5rem;
    }

    .analytics-big-stat .sub-stats {
      display: flex;
      gap: 1.5rem;
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .analytics-big-stat .sub-stats .stat-ok { color: var(--success); }
    .analytics-big-stat .sub-stats .stat-fail { color: var(--error); }

    /* ── Billing Note ──────────────────────────────────────────── */
    .info-note {
      border-left: 3px solid var(--accent);
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .info-note a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }

    .info-note a:hover { text-decoration: underline; }

    /* ── Top Contacts Table ────────────────────────────────────── */
    .contacts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
    }

    .contacts-table th {
      text-align: left;
      padding: 0.6rem 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }

    .contacts-table td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .contacts-table tr:last-child td { border-bottom: none; }

    /* ── Activity Search ───────────────────────────────────────── */
    .activity-search {
      padding: 0.4rem 0.65rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 0.8rem;
      outline: none;
      width: 200px;
      transition: border-color 0.2s;
    }

    .activity-search:focus { border-color: var(--border-focus); }

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

    /* ── Service Status Strip ─────────────────────────────────── */
    .service-strip {
      display: flex;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
      padding: 0.75rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      flex-wrap: wrap;
    }

    .service-dot {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .service-dot .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
    }

    .service-dot .dot.ok { background: var(--success); }
    .service-dot .dot.not_configured { background: var(--text-muted); }
    .service-dot .dot.error { background: var(--error); }

    /* ── Info Tooltips ─────────────────────────────────────────── */
    .info-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      border: 1px solid var(--text-muted);
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: help;
      position: relative;
      margin-left: 5px;
      vertical-align: middle;
      font-style: normal;
      line-height: 1;
      flex-shrink: 0;
    }

    .info-icon .info-tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #1c2128;
      color: #e1e4e8;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 400;
      white-space: nowrap;
      max-width: 260px;
      white-space: normal;
      z-index: 1000;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      line-height: 1.4;
    }

    .info-icon .info-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: #30363d;
    }

    .info-icon:hover .info-tooltip { display: block; }

    /* ── Download Button ───────────────────────────────────────── */
    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
      flex-shrink: 0;
      padding: 0;
    }

    .download-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .download-btn svg {
      width: 14px;
      height: 14px;
    }

    /* ── Agent Filter Bar ──────────────────────────────────────── */
    .agent-filter-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 0.6rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .agent-filter-bar label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .agent-filter-bar select {
      padding: 0.35rem 0.6rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 0.8rem;
      font-family: var(--font);
      cursor: pointer;
      outline: none;
      min-width: 180px;
    }

    .agent-filter-bar select:focus { border-color: var(--border-focus); }

    /* ── Activity Table ──────────────────────────────────────────── */
    .activity-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
    }

    .activity-table th {
      text-align: left;
      padding: 0.6rem 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }

    .activity-table td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .activity-table tr:last-child td { border-bottom: none; }

    .channel-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .channel-badge.sms { background: rgba(88, 166, 255, 0.15); color: var(--accent); }
    .channel-badge.email { background: rgba(63, 185, 80, 0.15); color: var(--success); }
    .channel-badge.voice, .channel-badge.call { background: rgba(188, 140, 255, 0.15); color: #bc8cff; }
    .channel-badge.whatsapp { background: rgba(63, 185, 80, 0.15); color: var(--success); }

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

    /* Quick Start Guide */
    .docs-section { margin-bottom: 2rem; }
    .docs-section h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 0.75rem;
    }
    .docs-section p {
      color: var(--text);
      font-size: 0.85rem;
      line-height: 1.6;
      margin-bottom: 0.75rem;
    }
    .docs-intro {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
    }
    .docs-intro p { margin-bottom: 0.5rem; }
    .docs-intro p:last-child { margin-bottom: 0; }

    /* Server info bar */
    .server-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .server-info label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .server-info code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.8rem;
      color: var(--accent);
      background: var(--bg-card);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--border);
      flex: 1;
      min-width: 200px;
    }
    .copy-btn {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.15s;
    }
    .copy-btn:hover { color: var(--accent); border-color: var(--accent); }
    .copy-btn.copied { color: var(--success); border-color: var(--success); }

    /* Connection options */
    .connect-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .connect-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
    }
    .connect-card h3 {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 0.5rem;
    }
    .connect-card p {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      line-height: 1.5;
    }
    .code-block {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      overflow-x: auto;
      position: relative;
    }
    .code-block pre {
      margin: 0;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.75rem;
      color: #c9d1d9;
      line-height: 1.5;
      white-space: pre;
    }
    .code-block .copy-btn {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      font-size: 0.65rem;
      padding: 0.2rem 0.4rem;
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.4);
    }
    .code-block .copy-btn:hover { color: var(--accent); border-color: var(--accent); }

    /* Auth info */
    .auth-info {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
    }
    .auth-info p { font-size: 0.8rem; color: var(--text); margin-bottom: 0.4rem; line-height: 1.5; }
    .auth-info p:last-child { margin-bottom: 0; }
    .auth-info code { color: var(--accent); font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.8rem; }

    /* Capability cards */
    .capability-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .capability-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      transition: border-color 0.15s;
    }
    .capability-card:hover { border-color: var(--accent); }
    .capability-card .cap-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .capability-card h3 { font-size: 0.9rem; font-weight: 700; color: var(--text-heading); margin-bottom: 0.35rem; }
    .capability-card p { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 0.5rem; }
    .capability-card .cap-endpoints {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-family: "SFMono-Regular", Consolas, monospace;
      border-top: 1px solid var(--border);
      padding-top: 0.5rem;
      margin-top: 0.25rem;
    }
    .capability-card .cap-endpoints span {
      display: inline-block;
      background: var(--bg-input);
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      margin: 0.15rem 0.15rem 0.15rem 0;
    }

    /* Collapsible sections */
    .collapsible-section { margin-bottom: 1.5rem; }
    .collapsible-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.75rem 1.25rem;
      color: var(--text-heading);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
    }
    .collapsible-toggle:hover { border-color: var(--accent); color: var(--accent); }
    .collapsible-toggle .chevron {
      transition: transform 0.2s;
      font-size: 0.7rem;
    }
    .collapsible-toggle.open .chevron { transform: rotate(90deg); }
    .collapsible-content {
      display: none;
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      padding: 1rem;
      background: var(--bg-card);
    }
    .collapsible-content.open { display: block; }

    /* Swagger overrides — hide confusing elements */
    #swagger-container { margin-bottom: 0; }
    .swagger-ui { background: transparent; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 10px 0; }
    .swagger-ui .info .title { color: var(--text-heading); }
    .swagger-ui .info p, .swagger-ui .info li { color: var(--text); }
    .swagger-ui .scheme-container { display: none; }
    .swagger-ui .auth-wrapper { display: none; }
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

    /* MCP tools section */
    .mcp-tools-section { margin-top: 0; }
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

    .tool-card .tool-params {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
    }
    .tool-card .tool-params .param {
      display: inline-block;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.7rem;
      background: var(--bg-input);
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      margin: 0.15rem 0.15rem 0.15rem 0;
      color: var(--text-muted);
    }
    .tool-card .tool-params .param.required { color: var(--accent); border: 1px solid rgba(99,102,241,0.2); }

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
      .health-grid { grid-template-columns: repeat(3, 1fr); }
      .analytics-row-3 { grid-template-columns: 1fr; }
      .analytics-row-2 { grid-template-columns: 1fr; }
      .edit-panel-inner { grid-template-columns: 1fr; }
      .inline-fields { grid-template-columns: 1fr 1fr; }
      .activity-search { width: 140px; }
    }

    @media (max-width: 480px) {
      .health-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
  <script>
    // Apply saved theme before paint to prevent flash
    (function(){var t=localStorage.getItem('bd-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');})();
  </script>
</head>
<body>
  <!-- ── Disclaimer Modal Overlay ──────────────────────────── -->
  <div id="disclaimer-overlay">
    <div class="disclaimer-modal">
      <h1>Platform Usage Disclaimer</h1>
      <p class="subtitle">Please read and accept before continuing</p>

      <div class="disclaimer-error" id="disclaimer-error"></div>

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

      <label class="disclaimer-checkbox-row">
        <input type="checkbox" id="disclaimer-check" onchange="document.getElementById('disclaimer-accept-btn').disabled = !this.checked">
        <label for="disclaimer-check">I have read and understand these terms. I accept full responsibility for my use of this platform.</label>
      </label>

      <button class="disclaimer-accept-btn" id="disclaimer-accept-btn" disabled onclick="acceptDisclaimer()">Accept &amp; Continue</button>
    </div>
  </div>

  <!-- ── Demo Banner ────────────────────────────────────────── -->
  <div id="demo-banner">DEMO MODE &mdash; All API calls use mock providers. No real messages are sent.</div>
  <div id="org-banner"></div>

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
        <button onclick="window.open('/docs','_blank')" style="margin-bottom:0.5rem;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <span>User Guide</span>
        </button>
        <button id="api-key-btn" title="API Key" onclick="openApiKeyModal()" style="margin-bottom:0.5rem;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
          <span>API Key</span>
        </button>
        <button id="theme-toggle" title="Toggle light/dark mode" style="margin-bottom:0.5rem;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
          <svg id="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          <svg id="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:none;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          <span id="theme-label">Light Mode</span>
        </button>
        <button id="logout-btn">Sign Out</button>
      </div>
    </aside>

    <!-- API Key Modal -->
    <div id="api-key-modal" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;" onclick="if(event.target===this)closeApiKeyModal()">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:2rem;max-width:480px;width:90%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h3 style="color:var(--text-heading);margin:0;font-size:1.1rem;">Your API Key</h3>
          <button onclick="closeApiKeyModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:4px 8px;" title="Close">&times;</button>
        </div>
        <div style="position:relative;">
          <div id="api-key-display" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:12px 60px 12px 14px;font-family:monospace;font-size:13px;color:var(--text-muted);word-break:break-all;min-height:20px;">Loading...</div>
          <button id="toggle-key-vis-btn" onclick="toggleApiKeyVisibility()" style="position:absolute;top:8px;right:8px;background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:11px;color:var(--text-muted);cursor:pointer;">Show</button>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Use as <code>Authorization: Bearer &lt;key&gt;</code> or <code>?token=&lt;key&gt;</code></p>
        <div style="display:flex;gap:8px;margin-top:1rem;">
          <button class="btn btn-sm btn-secondary" onclick="copyApiKey()" id="copy-key-btn" style="font-size:12px;padding:6px 16px;">Copy</button>
          <button class="btn btn-sm" onclick="regenerateApiKey()" style="font-size:12px;padding:6px 16px;background:var(--warning);color:#fff;">Regenerate</button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <main class="content">
      <!-- ── Dashboard Tab ────────────────────────────────────── -->
      <div id="tab-dashboard" class="tab-content active">
        <h1 class="page-title">Dashboard</h1>

        <div class="service-strip" id="service-strip"></div>

        <!-- Agent Filter -->
        <div class="agent-filter-bar">
          <label for="agent-filter">Filter by Agent</label>
          <select id="agent-filter" onchange="onAgentFilterChange()">
            <option value="">All Agents</option>
          </select>
        </div>

        <div class="health-grid">
          <div class="health-card">
            <div class="big-number" id="stat-uptime">--</div>
            <div class="card-label">Uptime <span class="info-icon">i<span class="info-tooltip">Server uptime since last restart</span></span></div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-agents">0</div>
            <div class="card-label">Provisioned Agents <span class="info-icon">i<span class="info-tooltip">Total provisioned agents</span></span></div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-messages">0</div>
            <div class="card-label">Total Messages <span class="info-icon">i<span class="info-tooltip">SMS, email, WhatsApp actions logged</span></span></div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-calls">0</div>
            <div class="card-label">Total Calls <span class="info-icon">i<span class="info-tooltip">Voice calls initiated or received</span></span></div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-delivery" style="color:var(--success)">--%</div>
            <div class="card-label">Delivery Rate <span class="info-icon">i<span class="info-tooltip">Actions delivered successfully (30d)</span></span></div>
          </div>
          <div class="health-card">
            <div class="big-number" id="stat-cost">$0.00</div>
            <div class="card-label">Total Cost <span class="info-icon">i<span class="info-tooltip">Cumulative provider costs</span></span></div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Messages Over Time <span class="info-icon">i<span class="info-tooltip">Daily message count by channel (30d)</span></span></span>
              <button class="download-btn" title="Download CSV" onclick="downloadMessagesChart()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </h3>
            <div class="chart-wrapper">
              <canvas id="messages-chart"></canvas>
              <div class="chart-empty" id="messages-chart-empty">No data yet</div>
            </div>
          </div>
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Cost by Channel <span class="info-icon">i<span class="info-tooltip">Cost breakdown by channel (30d)</span></span></span>
              <span style="display:flex;align-items:center;gap:6px;"><span id="cost-chart-total" style="color:var(--text-muted);font-size:0.85rem;font-weight:600"></span><button class="download-btn" title="Download CSV" onclick="downloadCostByChannel()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button></span>
            </h3>
            <div class="chart-wrapper">
              <canvas id="cost-chart"></canvas>
              <div class="chart-empty" id="cost-chart-empty">No data yet</div>
            </div>
          </div>
        </div>

        <div class="card progress-section">
          <div class="card-header">
            <span class="card-title">Usage vs Limits <span class="info-icon">i<span class="info-tooltip">Current usage vs configured limits</span></span></span>
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
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;">Limits are configured per-agent in the Agents tab.</div>
        </div>

        <!-- spacer before analytics -->
        <div style="height:0.5rem"></div>

        <!-- Analytics Section -->
        <div class="card-header" style="margin-top:0.5rem;margin-bottom:0.75rem;">
          <span class="card-title" style="font-size:1rem;">Analytics (30 days)</span>
        </div>

        <div class="analytics-row analytics-row-3">
          <div class="chart-card">
            <h3>Delivery Rate <span class="info-icon">i<span class="info-tooltip">Success vs failure rate (30d)</span></span></h3>
            <div class="analytics-big-stat" id="analytics-delivery">
              <div class="chart-empty visible">No data yet</div>
            </div>
          </div>
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Channel Distribution <span class="info-icon">i<span class="info-tooltip">Actions by channel type (30d)</span></span></span>
              <button class="download-btn" title="Download CSV" onclick="downloadChannelDist()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </h3>
            <div class="chart-wrapper">
              <canvas id="channel-dist-chart"></canvas>
              <div class="chart-empty" id="channel-dist-empty">No data yet</div>
            </div>
          </div>
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Cost Trend (14d) <span class="info-icon">i<span class="info-tooltip">Daily cost trend (14d)</span></span></span>
              <button class="download-btn" title="Download CSV" onclick="downloadCostTrend()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </h3>
            <div class="chart-wrapper">
              <canvas id="cost-trend-chart"></canvas>
              <div class="chart-empty" id="cost-trend-empty">No data yet</div>
            </div>
          </div>
        </div>

        <div class="analytics-row analytics-row-2">
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Peak Hours <span class="info-icon">i<span class="info-tooltip">Busiest hours by action count (30d)</span></span></span>
              <button class="download-btn" title="Download CSV" onclick="downloadPeakHours()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </h3>
            <div class="chart-wrapper">
              <canvas id="peak-hours-chart"></canvas>
              <div class="chart-empty" id="peak-hours-empty">No data yet</div>
            </div>
          </div>
          <div class="chart-card">
            <h3 style="display:flex;align-items:center;justify-content:space-between;">
              <span>Error Rate (7d) <span class="info-icon">i<span class="info-tooltip">Daily error percentage (7d)</span></span></span>
              <button class="download-btn" title="Download CSV" onclick="downloadErrorRate()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </h3>
            <div class="chart-wrapper">
              <canvas id="error-rate-chart"></canvas>
              <div class="chart-empty" id="error-rate-empty">No data yet</div>
            </div>
          </div>
        </div>

        <!-- Top Contacts -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Top Contacts <span class="info-icon">i<span class="info-tooltip">Most contacted addresses</span></span></span>
            <button class="download-btn" title="Download CSV" onclick="downloadTopContacts()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
          </div>
          <table class="contacts-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Channel</th>
                <th>Actions</th>
                <th>Cost</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody id="top-contacts-body">
              <tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">No contacts yet</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Activity <span class="info-icon">i<span class="info-tooltip">Latest actions with status and cost</span></span></span>
            <span style="display:flex;align-items:center;gap:6px;">
              <input type="text" class="activity-search" id="activity-search" placeholder="Filter activity..." oninput="filterActivity()">
              <button class="download-btn" title="Download CSV" onclick="downloadRecentActivity()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </span>
          </div>
          <table class="activity-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Target</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="activity-body">
              <tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">No activity yet</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Alerts <span class="info-icon">i<span class="info-tooltip">System audit events and alerts</span></span></span>
            <span style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-sm btn-secondary" onclick="loadDashboard()">Refresh</button>
              <button class="download-btn" title="Download CSV" onclick="downloadRecentAlerts()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
            </span>
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
              <option value="he-IL">Hebrew</option>
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

        <!-- Compliance Group -->
        <div class="group-heading">Compliance</div>

        <div class="card" id="card-disclosure">
          <div class="card-header">
            <span class="card-title">AI Voice Disclosure</span>
            <span class="badge badge-info" id="disclosure-badge">--</span>
          </div>
          <div class="card-desc">FCC requires AI-generated calls to disclose they are AI at the start. Disabling this transfers legal liability to you.</div>
          <div class="field">
            <label>Enable AI Disclosure</label>
            <select id="disclosure-enabled">
              <option value="true">Enabled (recommended)</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div class="field">
            <label>Disclosure Text</label>
            <input type="text" id="disclosure-text" placeholder="Please note, this is an AI-generated call. " value="Please note, this is an AI-generated call. ">
          </div>
          <div class="card-desc" style="font-size:0.75rem;color:var(--warning);margin-top:0.5rem;">
            Warning: Disabling AI disclosure may violate FCC rules and state robocall laws. You assume full legal responsibility.
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-primary" onclick="saveDisclosure()">Save</button>
          </div>
        </div>

        <!-- Registration Group -->
        <div class="group-heading">Registration</div>

        <div class="card" id="card-email-verification">
          <div class="card-header">
            <span class="card-title">Email Verification</span>
            <span class="badge badge-info" id="email-verification-badge">--</span>
          </div>
          <div class="card-desc">Require new users to verify their email with an OTP code before their account is created. Turn this on once you have an email service (Resend) configured.</div>
          <div class="field">
            <label>Require Email Verification</label>
            <select id="email-verification-enabled">
              <option value="false">Disabled (accounts created immediately)</option>
              <option value="true">Enabled (OTP required)</option>
            </select>
          </div>
          <div class="card-desc" style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem;">
            When disabled, new accounts are created immediately without email verification. Enable this after configuring Resend email above.
          </div>
          <div class="settings-actions">
            <button class="btn btn-sm btn-primary" onclick="saveEmailVerification()">Save</button>
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
            <label>Orchestrator Security Token</label>
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
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h1 class="page-title" style="margin-bottom:0;">Agents</h1>
          <div style="display:flex;align-items:center;gap:1rem;">
            <span id="pool-capacity" style="font-size:0.8rem;color:var(--text-muted);"></span>
            <button class="btn btn-sm btn-primary" onclick="toggleProvisionForm()" id="new-agent-btn" style="padding:8px 16px;font-size:0.8rem;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">+ New Agent</button>
          </div>
        </div>

        <!-- Provision Form (hidden by default) -->
        <div id="provision-form" class="card" style="display:none;margin-bottom:1rem;padding:1.5rem;">
          <h3 style="color:var(--text-heading);margin-bottom:1rem;font-size:1rem;">Provision New Agent</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Agent ID</label><input type="text" id="prov-agent-id" placeholder="my-agent-001" style="width:100%;padding:8px 10px;font-size:0.85rem;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:6px;outline:none;"></div>
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Display Name</label><input type="text" id="prov-display-name" placeholder="My Agent" style="width:100%;padding:8px 10px;font-size:0.85rem;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:6px;outline:none;"></div>
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Country</label><select id="prov-country" style="width:100%;padding:8px 10px;font-size:0.85rem;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:6px;outline:none;">
              <option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option><option value="DE">Germany</option><option value="FR">France</option><option value="IL">Israel</option><option value="JP">Japan</option><option value="BR">Brazil</option><option value="IN">India</option>
            </select></div>
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Capabilities</label>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;padding:8px 0;">
                <label style="font-size:0.8rem;color:var(--text);display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="prov-cap-sms" checked> SMS</label>
                <label style="font-size:0.8rem;color:var(--text);display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="prov-cap-voice"> Voice</label>
                <label style="font-size:0.8rem;color:var(--text);display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="prov-cap-email"> Email</label>
                <label style="font-size:0.8rem;color:var(--text);display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="prov-cap-whatsapp"> WhatsApp</label>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.75rem;">
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">System Prompt (optional)</label><textarea id="prov-system-prompt" rows="2" placeholder="AI agent instructions" style="width:100%;padding:8px 10px;font-size:0.85rem;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:6px;outline:none;resize:vertical;font-family:inherit;"></textarea></div>
            <div class="field"><label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Greeting (optional)</label><input type="text" id="prov-greeting" placeholder="Hello, how can I help?" style="width:100%;padding:8px 10px;font-size:0.85rem;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:6px;outline:none;"></div>
          </div>
          <div style="margin-top:1rem;display:flex;gap:0.75rem;">
            <button class="btn btn-sm btn-primary" onclick="provisionAgent()" id="prov-submit-btn" style="padding:8px 20px;font-size:0.85rem;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">Provision Agent</button>
            <button class="btn btn-sm" onclick="toggleProvisionForm()" style="padding:8px 20px;font-size:0.85rem;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Cancel</button>
            <span id="prov-result" style="font-size:0.8rem;align-self:center;"></span>
          </div>
        </div>

        <!-- Token Reveal Modal (hidden) -->
        <div id="token-reveal-modal" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;">
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:2rem;max-width:500px;width:90%;">
            <h3 style="color:var(--text-heading);margin-bottom:0.75rem;">Agent Provisioned Successfully</h3>
            <div style="background:rgba(210,153,34,0.15);border:1px solid rgba(210,153,34,0.3);color:#d29922;padding:10px 14px;border-radius:6px;font-size:0.8rem;margin-bottom:1rem;">
              Save this security token now! It cannot be recovered later.
            </div>
            <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">Agent Security Token:</p>
            <div id="revealed-token" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:0.8rem;color:var(--accent);margin-bottom:1rem;"></div>
            <div style="display:flex;gap:0.75rem;">
              <button onclick="copyRevealedToken()" style="padding:8px 16px;font-size:0.8rem;background:transparent;color:var(--accent);border:1px solid var(--border);border-radius:6px;cursor:pointer;" id="copy-revealed-btn">Copy Token</button>
              <button onclick="closeTokenModal()" style="padding:8px 16px;font-size:0.8rem;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;flex:1;">Done</button>
            </div>
          </div>
        </div>

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
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody id="agents-body">
              <tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:1.5rem;">Loading agents...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── API Docs Tab ─────────────────────────────────────── -->
      <div id="tab-docs" class="tab-content">
        <h1 class="page-title">API Documentation</h1>

        <!-- Section A: Quick Start Guide -->
        <div class="docs-section">
          <div class="docs-intro">
            <p><strong>What is this?</strong> This platform lets AI agents send messages (SMS, email, WhatsApp, LINE) and make voice calls through a unified API. Connect via REST or MCP protocol.</p>
            <p>Your API key is on the <strong>Dashboard</strong> tab. Include it as a Bearer token in every request.</p>
          </div>

          <div class="server-info">
            <label>Server</label>
            <code id="docs-server-url">Loading...</code>
            <button class="copy-btn" onclick="copyText(document.getElementById('docs-server-url').textContent)">Copy</button>
            <label>API Key</label>
            <code id="docs-api-key" style="color:var(--text-muted);">Go to Dashboard tab</code>
          </div>

          <h2>How to Connect</h2>
          <div class="connect-grid">
            <div class="connect-card">
              <h3>REST API</h3>
              <p>Standard HTTP endpoints. Works with any language or tool that can make HTTP requests.</p>
              <div class="code-block">
                <button class="copy-btn" onclick="copyCodeBlock(this)">Copy</button>
                <pre>curl -X POST <span id="curl-base-url">SERVER</span>/api/v1/send-message \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "my-agent",
    "to": "+15551234567",
    "body": "Hello from VOS!"
  }'</pre>
              </div>
            </div>
            <div class="connect-card">
              <h3>MCP Protocol</h3>
              <p>For AI agents that support Model Context Protocol. Connects via Server-Sent Events.</p>
              <div class="code-block">
                <button class="copy-btn" onclick="copyCodeBlock(this)">Copy</button>
                <pre># Connect with any MCP client
SSE endpoint: <span id="mcp-base-url">SERVER</span>/sse?agentId=my-agent

# In Claude Desktop config:
{
  "mcpServers": {
    "vos": {
      "url": "<span id="mcp-config-url">SERVER</span>/sse"
    }
  }
}</pre>
              </div>
            </div>
            <div class="connect-card">
              <h3>Admin API</h3>
              <p>Manage the platform: provision agents, check usage, configure billing. Requires admin token.</p>
              <div class="code-block">
                <button class="copy-btn" onclick="copyCodeBlock(this)">Copy</button>
                <pre>curl <span id="admin-base-url">SERVER</span>/admin/api/status \\
  -H "Authorization: Bearer ADMIN_TOKEN"</pre>
              </div>
            </div>
          </div>

          <div class="auth-info">
            <p><strong>Authentication:</strong> All API calls require a Bearer token in the <code>Authorization</code> header.</p>
            <p>Two token levels: <strong>Orchestrator</strong> — controls the whole platform: create/remove agents, set billing, configure limits, plus send messages and make calls as any agent. <strong>Agent</strong> — can only send messages and make calls as itself, nothing else. Each agent gets its own token when provisioned.</p>
          </div>
        </div>

        <!-- Section B: What You Can Do -->
        <div class="docs-section">
          <h2>What You Can Do</h2>
          <div class="capability-grid">
            <div class="capability-card">
              <div class="cap-icon">&#9993;</div>
              <h3>Send Messages</h3>
              <p>Send SMS, email, WhatsApp, and LINE messages. Supports templates and HTML email.</p>
              <div class="cap-endpoints">
                <span>POST /api/v1/send-message</span>
                <span>GET /api/v1/waiting-messages</span>
                <span>comms_send_message</span>
              </div>
            </div>
            <div class="capability-card">
              <div class="cap-icon">&#128222;</div>
              <h3>Voice Calls</h3>
              <p>Make AI voice calls, send voice messages, transfer live calls, or call on someone's behalf.</p>
              <div class="cap-endpoints">
                <span>POST /api/v1/make-call</span>
                <span>POST /api/v1/call-on-behalf</span>
                <span>POST /api/v1/send-voice-message</span>
                <span>POST /api/v1/transfer-call</span>
              </div>
            </div>
            <div class="capability-card">
              <div class="cap-icon">&#128100;</div>
              <h3>Manage Agents</h3>
              <p>Provision and deprovision agents, check channel status, onboard new customers with all channels.</p>
              <div class="cap-endpoints">
                <span>POST /api/v1/provision</span>
                <span>POST /api/v1/deprovision</span>
                <span>GET /api/v1/channel-status</span>
                <span>POST /api/v1/onboard</span>
              </div>
            </div>
            <div class="capability-card">
              <div class="cap-icon">&#128202;</div>
              <h3>Monitor Usage</h3>
              <p>Track usage stats, billing costs, set rate limits and spending caps per agent.</p>
              <div class="cap-endpoints">
                <span>GET /api/v1/usage</span>
                <span>GET /api/v1/billing</span>
                <span>POST /api/v1/billing/config</span>
                <span>POST /api/v1/agent-limits</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Section C: REST API Reference (collapsible) -->
        <div class="collapsible-section">
          <button class="collapsible-toggle" onclick="toggleCollapsible(this)">
            <span class="chevron">&#9654;</span> REST API Reference
          </button>
          <div class="collapsible-content">
            <div id="swagger-container"></div>
          </div>
        </div>

        <!-- Section D: MCP Tools Reference (collapsible) -->
        <div class="collapsible-section">
          <button class="collapsible-toggle" onclick="toggleCollapsible(this)">
            <span class="chevron">&#9654;</span> MCP Tools Reference
          </button>
          <div class="collapsible-content">
            <div class="mcp-tools-section">
              <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem;">
                MCP (Model Context Protocol) lets AI agents call tools directly via a persistent SSE connection.
                Connect to <code>/sse?agentId=YOUR_AGENT</code> with any MCP-compatible client.
              </p>
              <div id="mcp-tools"></div>
            </div>
          </div>
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
    let channelDistChart = null;
    let costTrendChart = null;
    let peakHoursChart = null;
    let errorRateChart = null;
    let dashboardTimer = null;
    let swaggerLoaded = false;
    let tierPresets = {};
    let allActivity = [];
    let analyticsTimer = null;
    let _dashData = null;
    let _histData = null;
    let _analyticsData = null;
    let _topContactsData = null;

    /* ── Auth helpers ─────────────────────────────────────────── */
    function authHeaders() {
      return { 'Content-Type': 'application/json' };
    }

    async function apiFetch(url, opts = {}) {
      const defaults = { headers: authHeaders(), credentials: 'same-origin' };
      const merged = { ...defaults, ...opts, headers: { ...defaults.headers, ...(opts.headers || {}) } };
      return fetch(url, merged);
    }

    /* ── Session check — redirect to login if no valid session ── */
    (async () => {
      try {
        const cookieRes = await fetch('/admin/api/my-org', { credentials: 'same-origin' });
        if (cookieRes.ok) {
          onAuthenticated();
          return;
        }
      } catch {}
      // No valid session — redirect to login page
      window.location.href = '/auth/login';
    })();

    /* ── Logout ───────────────────────────────────────────────── */
    document.getElementById('logout-btn').addEventListener('click', async () => {
      // Clear server-side session cookie
      try {
        await fetch('/auth/api/logout', { method: 'POST', credentials: 'same-origin' });
      } catch {}
      if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; }
      window.location.href = '/auth/login';
    });

    /* ── Theme Toggle ─────────────────────────────────────────── */
    (function initThemeToggle() {
      const btn = document.getElementById('theme-toggle');
      const iconMoon = document.getElementById('theme-icon-moon');
      const iconSun = document.getElementById('theme-icon-sun');
      const label = document.getElementById('theme-label');

      function applyTheme(theme) {
        if (theme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
          iconMoon.style.display = 'none';
          iconSun.style.display = '';
          label.textContent = 'Dark Mode';
        } else {
          document.documentElement.removeAttribute('data-theme');
          iconMoon.style.display = '';
          iconSun.style.display = 'none';
          label.textContent = 'Light Mode';
        }
      }

      // Apply current theme on load
      applyTheme(localStorage.getItem('bd-theme') || 'dark');

      btn.addEventListener('click', () => {
        const current = localStorage.getItem('bd-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('bd-theme', next);
        applyTheme(next);
      });
    })();

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

      /* Initialize docs page on first visit */
      if (tabId === 'docs') {
        initDocsPage();
        initMcpTools();
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
    let orgInfo = null;

    async function onAuthenticated() {
      /* Check disclaimer status first — show modal if not accepted */
      await checkDisclaimerStatus();

      switchTab(getInitialTab());
      await checkDemoMode();
      await loadOrgInfo();
      loadDashboard();
      loadApiKey();
      loadAnalytics();
      loadSettingsStatus();
      loadVoices();

      /* Auto-refresh dashboard every 30 seconds */
      if (dashboardTimer) clearInterval(dashboardTimer);
      dashboardTimer = setInterval(loadDashboard, 30000);

      /* Analytics refresh every 2 minutes */
      if (analyticsTimer) clearInterval(analyticsTimer);
      analyticsTimer = setInterval(loadAnalytics, 120000);
    }

    /* ── Disclaimer Modal ─────────────────────────────────────── */
    async function checkDisclaimerStatus() {
      try {
        const res = await fetch('/auth/api/disclaimer-status', { credentials: 'same-origin' });
        if (!res.ok) return; // Not authenticated via cookie (super-admin token) — skip
        const data = await res.json();
        if (!data.accepted) {
          document.getElementById('disclaimer-overlay').classList.add('visible');
        }
      } catch {}
    }

    window.acceptDisclaimer = async function() {
      var btn = document.getElementById('disclaimer-accept-btn');
      var errEl = document.getElementById('disclaimer-error');
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
          document.getElementById('disclaimer-overlay').classList.remove('visible');
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
    };

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

    /* ── Org Info + Banner ────────────────────────────────────── */
    async function loadOrgInfo() {
      try {
        const res = await apiFetch('/admin/api/my-org');
        if (!res.ok) return;
        orgInfo = await res.json();

        const banner = document.getElementById('org-banner');
        if (!banner) return;

        /* Super-admin and demo mode don't show org banner */
        if (orgInfo.role === 'super-admin') return;

        if (orgInfo.accountStatus === 'suspended') {
          banner.textContent = 'ACCOUNT SUSPENDED — Contact support for assistance.';
          banner.className = 'suspended visible';
          banner.id = 'org-banner';
        } else if (orgInfo.mode === 'sandbox' && orgInfo.accountStatus === 'pending_review') {
          banner.textContent = 'SANDBOX MODE — Your account is under review. All API calls use mock providers.';
          banner.className = 'sandbox-pending visible';
          banner.id = 'org-banner';
        } else if (orgInfo.mode === 'sandbox') {
          banner.textContent = 'SANDBOX MODE — Account approved. Contact support to switch to production.';
          banner.className = 'sandbox-approved visible';
          banner.id = 'org-banner';
        }
        /* Production mode = no banner */
      } catch {}
    }

    /* ── Dashboard ────────────────────────────────────────────── */
    /* ── API Key helpers ──────────────────────────────────── */
    let cachedApiKey = null;
    let apiKeyRevealed = false;

    function maskApiKey(key) {
      if (!key) return '';
      return '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    }

    function renderApiKeyDisplay() {
      const el = document.getElementById('api-key-display');
      const btn = document.getElementById('toggle-key-vis-btn');
      if (!el) return;
      if (!cachedApiKey) {
        el.textContent = 'Not available (super-admin or bearer token login)';
        if (btn) btn.style.display = 'none';
        return;
      }
      el.textContent = apiKeyRevealed ? cachedApiKey : maskApiKey(cachedApiKey);
      if (btn) { btn.textContent = apiKeyRevealed ? 'Hide' : 'Show'; btn.style.display = ''; }
    }

    async function loadApiKey() {
      try {
        const res = await apiFetch('/admin/api/my-token');
        const data = await res.json();
        cachedApiKey = data.token || null;
        renderApiKeyDisplay();
      } catch {
        const el = document.getElementById('api-key-display');
        if (el) el.textContent = 'Failed to load';
      }
    }

    window.openApiKeyModal = function() {
      const modal = document.getElementById('api-key-modal');
      if (modal) { modal.style.display = 'flex'; }
      apiKeyRevealed = false;
      if (!cachedApiKey) { loadApiKey(); } else { renderApiKeyDisplay(); }
    };

    window.closeApiKeyModal = function() {
      const modal = document.getElementById('api-key-modal');
      if (modal) { modal.style.display = 'none'; }
      apiKeyRevealed = false;
      renderApiKeyDisplay();
    };

    window.toggleApiKeyVisibility = function() {
      apiKeyRevealed = !apiKeyRevealed;
      renderApiKeyDisplay();
    };

    window.copyApiKey = function() {
      if (!cachedApiKey) return;
      navigator.clipboard.writeText(cachedApiKey).then(() => {
        const btn = document.getElementById('copy-key-btn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
      });
    };

    window.regenerateApiKey = async function() {
      if (!confirm('Regenerate your API key? The old key will still work, but a new one will be generated.')) return;
      try {
        const res = await apiFetch('/admin/api/regenerate-token', { method: 'POST' });
        const data = await res.json();
        if (data.token) {
          cachedApiKey = data.token;
          apiKeyRevealed = true;
          renderApiKeyDisplay();
        }
      } catch (err) {
        alert('Failed to regenerate token');
      }
    };

    function getAgentFilter() {
      const sel = document.getElementById('agent-filter');
      return sel ? sel.value : '';
    }

    function agentQueryParam() {
      const id = getAgentFilter();
      return id ? '?agentId=' + encodeURIComponent(id) : '';
    }

    function onAgentFilterChange() {
      loadDashboard();
      loadAnalytics();
    }

    async function loadDashboard() {
      try {
        const aq = agentQueryParam();
        const [dashRes, histRes, healthRes] = await Promise.all([
          apiFetch('/admin/api/dashboard' + aq),
          apiFetch('/admin/api/usage-history' + aq),
          fetch('/health')
        ]);

        const dash = await dashRes.json();
        const hist = await histRes.json();
        _dashData = dash;
        _histData = hist;

        /* Populate agent dropdown (always from full agent list) */
        const agentSel = document.getElementById('agent-filter');
        if (agentSel && dash.agents && dash.agents.length > 0) {
          const currentVal = agentSel.value;
          const opts = '<option value="">All Agents</option>' +
            dash.agents.map(a => '<option value="' + escAttr(a.agent_id) + '"' + (currentVal === a.agent_id ? ' selected' : '') + '>' + escHtml(a.display_name || a.agent_id) + '</option>').join('');
          agentSel.innerHTML = opts;
        }
        let health = {};
        try { health = await healthRes.json(); } catch {}

        /* Uptime */
        const uptimeSec = health.uptime || 0;
        const hours = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        document.getElementById('stat-uptime').textContent =
          hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';

        /* Service status strip — render provider names dynamically */
        const svc = dash.services || {};
        const stripEl = document.getElementById('service-strip');
        if (stripEl) {
          stripEl.innerHTML = Object.entries(svc).map(([key, val]) => {
            const status = typeof val === 'object' ? val.status : val;
            const provider = typeof val === 'object' && val.provider ? val.provider : key;
            return '<div class="service-dot" title="' + escAttr(key + ': ' + status) + '"><span class="dot ' + escAttr(status || 'not_configured') + '"></span> ' + escHtml(provider) + '</div>';
          }).join('');
        }

        /* Health cards */
        const agents = dash.agents || [];
        document.getElementById('stat-agents').textContent = agents.length;
        document.getElementById('stat-messages').textContent = (dash.usage?.totalMessages || 0).toLocaleString();
        document.getElementById('stat-calls').textContent = (dash.usage?.totalCalls || 0).toLocaleString();
        const drTotal = dash.usage?.deliveryTotal || 0;
        const drSuccess = dash.usage?.deliverySuccess || 0;
        const drEl = document.getElementById('stat-delivery');
        if (drTotal > 0) {
          const drPct = (drSuccess / drTotal * 100).toFixed(1);
          drEl.textContent = drPct + '%';
          drEl.style.color = parseFloat(drPct) >= 95 ? 'var(--success)' : parseFloat(drPct) >= 80 ? 'var(--warning)' : 'var(--error)';
        } else {
          drEl.textContent = '--%';
          drEl.style.color = 'var(--text-muted)';
        }
        document.getElementById('stat-cost').textContent = '$' + (dash.usage?.totalCost || 0).toFixed(2);

        /* Progress bars — use real daily/monthly spend and dynamic limits */
        const limits = dash.usage?.limits || {};
        const actionsToday = dash.usage?.todayActions || 0;
        const actionsLimit = limits.maxActionsDay || 500;
        const actionsPct = Math.min(100, (actionsToday / actionsLimit) * 100);
        document.getElementById('usage-actions').textContent = actionsToday + ' / ' + actionsLimit;
        const fillActions = document.getElementById('fill-actions');
        fillActions.style.width = actionsPct + '%';
        fillActions.className = 'progress-fill' + (actionsPct > 90 ? ' danger' : actionsPct > 70 ? ' warn' : '');

        const spendDay = dash.usage?.spendToday || 0;
        const spendDayLimit = limits.maxSpendDay || 10;
        const spendDayPct = Math.min(100, (spendDay / spendDayLimit) * 100);
        document.getElementById('usage-spend-day').textContent = '$' + spendDay.toFixed(2) + ' / $' + spendDayLimit.toFixed(2);
        const fillSpendDay = document.getElementById('fill-spend-day');
        fillSpendDay.style.width = spendDayPct + '%';
        fillSpendDay.className = 'progress-fill' + (spendDayPct > 90 ? ' danger' : spendDayPct > 70 ? ' warn' : '');

        const spendMonth = dash.usage?.spendThisMonth || 0;
        const spendMonthLimit = limits.maxSpendMonth || 100;
        const spendMonthPct = Math.min(100, (spendMonth / spendMonthLimit) * 100);
        document.getElementById('usage-spend-month').textContent = '$' + spendMonth.toFixed(2) + ' / $' + spendMonthLimit.toFixed(2);
        const fillSpendMonth = document.getElementById('fill-spend-month');
        fillSpendMonth.style.width = spendMonthPct + '%';
        fillSpendMonth.className = 'progress-fill' + (spendMonthPct > 90 ? ' danger' : spendMonthPct > 70 ? ' warn' : '');

        /* Recent activity table */
        allActivity = dash.recentActivity || [];
        renderActivityTable(allActivity);

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

        /* Top contacts (non-blocking) */
        apiFetch('/admin/api/top-contacts' + aq).then(r => r.json()).then(d => {
          _topContactsData = d.contacts || [];
          renderTopContacts(_topContactsData);
        }).catch(() => {});

      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    }

    /* ── Load Analytics (separate, slower refresh) ─────────── */
    async function loadAnalytics() {
      try {
        const res = await apiFetch('/admin/api/analytics' + agentQueryParam());
        const data = await res.json();
        _analyticsData = data;
        renderDeliveryRate(data.deliveryRate || {});
        renderChannelDistChart(data.channelDistribution || []);
        renderCostTrendChart(data.costTrend || []);
        renderPeakHoursChart(data.peakHours || []);
        renderErrorRateChart(data.errorRate || []);
      } catch (err) {
        console.error('Analytics load error:', err);
      }
    }

    /* ── Charts ───────────────────────────────────────────────── */
    const chartColors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#f78166', '#79c0ff'];

    function renderMessagesChart(data) {
      const ctx = document.getElementById('messages-chart');
      const emptyEl = document.getElementById('messages-chart-empty');
      if (!ctx) return;

      if (!data || data.length === 0) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (messagesChart) { messagesChart.destroy(); messagesChart = null; }
        return;
      }

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

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
      const emptyEl = document.getElementById('cost-chart-empty');
      if (!ctx) return;

      const labels = data.map(d => d.channel || 'unknown');
      const values = data.map(d => parseFloat(d.total_cost) || 0);

      if (costChart) costChart.destroy();

      const totalEl = document.getElementById('cost-chart-total');

      if (values.length === 0 || values.every(v => v === 0)) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (totalEl) totalEl.textContent = '';
        costChart = null;
        return;
      }

      if (totalEl) totalEl.textContent = 'Total: $' + values.reduce((a, b) => a + b, 0).toFixed(2);

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

      const total = values.reduce((a, b) => a + b, 0);
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
        plugins: [{
          id: 'costLabels',
          afterDraw(chart) {
            const { ctx: c, data, chartArea } = chart;
            if (!data.datasets[0]) return;
            const meta = chart.getDatasetMeta(0);
            c.save();
            c.font = '11px system-ui, sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            meta.data.forEach((arc, i) => {
              const val = data.datasets[0].data[i];
              if (val <= 0) return;
              const pct = total > 0 ? (val / total * 100).toFixed(0) + '%' : '';
              const usd = '$' + val.toFixed(2);
              const pos = arc.tooltipPosition();
              c.fillStyle = '#e6edf3';
              c.fillText(pct, pos.x, pos.y - 7);
              c.fillStyle = '#8b949e';
              c.fillText(usd, pos.x, pos.y + 7);
            });
            c.restore();
          }
        }],
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#8b949e',
                font: { size: 11 },
                padding: 12,
                generateLabels(chart) {
                  const ds = chart.data.datasets[0];
                  const t = ds.data.reduce((a, b) => a + b, 0);
                  return chart.data.labels.map((lbl, i) => {
                    const v = ds.data[i];
                    const pct = t > 0 ? (v / t * 100).toFixed(0) : '0';
                    return {
                      text: lbl + '  $' + v.toFixed(2) + '  (' + pct + '%)',
                      fillStyle: ds.backgroundColor[i],
                      hidden: false,
                      index: i,
                    };
                  });
                }
              }
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed;
                  const pct = total > 0 ? (v / total * 100).toFixed(1) : '0';
                  return ctx.label + ': $' + v.toFixed(2) + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
    }

    /* ── Activity table with search + exact timestamps ────────── */
    function renderActivityTable(activity) {
      const activityBody = document.getElementById('activity-body');
      if (!activityBody) return;

      if (activity.length === 0) {
        activityBody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">No activity yet</td></tr>';
        return;
      }

      activityBody.innerHTML = activity.map(a => {
        const ch = (a.channel || a.actionType || '').toLowerCase();
        const chLabel = (a.channel || a.actionType || 'unknown').toUpperCase();
        const statusOk = (a.status || '').toLowerCase() === 'ok' || (a.status || '').toLowerCase() === 'success' || (a.status || '').toLowerCase() === 'delivered';
        const statusBadge = statusOk
          ? '<span class="badge badge-success">OK</span>'
          : '<span class="badge badge-error">' + escHtml(String(a.status || 'unknown')) + '</span>';
        const cost = typeof a.cost === 'number' ? '$' + a.cost.toFixed(4) : '--';
        const tsAgo = a.timestamp ? timeAgo(a.timestamp) : '--';
        const tsExact = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
        return '<tr>' +
          '<td><span class="channel-badge ' + escAttr(ch) + '">' + escHtml(chLabel) + '</span></td>' +
          '<td style="font-size:0.8rem;">' + escHtml(String(a.target || '--')) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td style="color:var(--text-muted);font-size:0.8rem;">' + cost + '</td>' +
          '<td style="color:var(--text-muted);white-space:nowrap;font-size:0.8rem;">' + tsAgo +
            (tsExact ? '<br><span style="font-size:0.65rem;">' + escHtml(tsExact) + '</span>' : '') +
          '</td>' +
          '</tr>';
      }).join('');
    }

    function filterActivity() {
      const query = (document.getElementById('activity-search').value || '').toLowerCase().trim();
      if (!query) {
        renderActivityTable(allActivity);
        return;
      }
      const filtered = allActivity.filter(a => {
        const text = [a.actionType, a.channel, a.target, a.status].join(' ').toLowerCase();
        return text.includes(query);
      });
      renderActivityTable(filtered);
    }

    /* ── Top Contacts ──────────────────────────────────────────── */
    function maskContact(addr) {
      if (!addr) return '--';
      const s = String(addr);
      if (s.startsWith('+') && s.length > 6) {
        return s.slice(0, 4) + '***' + s.slice(-4);
      }
      if (s.includes('@')) {
        const parts = s.split('@');
        return parts[0].slice(0, 2) + '***@' + parts[1];
      }
      return s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : s;
    }

    function renderTopContacts(contacts) {
      const body = document.getElementById('top-contacts-body');
      if (!body) return;

      if (!contacts || contacts.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">No contacts yet</td></tr>';
        return;
      }

      body.innerHTML = contacts.map(c => {
        const ch = (c.channel || '').toLowerCase();
        const chLabel = (c.channel || 'unknown').toUpperCase();
        const cost = typeof c.total_cost === 'number' ? '$' + c.total_cost.toFixed(4) : '--';
        const ts = c.last_activity ? timeAgo(c.last_activity) : '--';
        return '<tr>' +
          '<td style="font-size:0.8rem;">' + escHtml(maskContact(c.target_address)) + '</td>' +
          '<td><span class="channel-badge ' + escAttr(ch) + '">' + escHtml(chLabel) + '</span></td>' +
          '<td style="color:var(--text);font-weight:600;">' + (c.action_count || 0) + '</td>' +
          '<td style="color:var(--text-muted);font-size:0.8rem;">' + cost + '</td>' +
          '<td style="color:var(--text-muted);white-space:nowrap;font-size:0.8rem;">' + ts + '</td>' +
          '</tr>';
      }).join('');
    }

    /* ── Analytics Charts ──────────────────────────────────────── */
    function renderDeliveryRate(data) {
      const container = document.getElementById('analytics-delivery');
      if (!container) return;

      if (!data || !data.total || data.total === 0) {
        container.innerHTML = '<div class="chart-empty visible">No data yet</div>';
        return;
      }

      const pct = ((data.success || 0) / data.total * 100).toFixed(1);
      const pctColor = parseFloat(pct) >= 95 ? 'var(--success)' : parseFloat(pct) >= 80 ? 'var(--warning)' : 'var(--error)';
      container.innerHTML =
        '<div class="big-value" style="color:' + pctColor + ';">' + pct + '%</div>' +
        '<div class="big-label">Delivery Rate</div>' +
        '<div class="sub-stats">' +
          '<span class="stat-ok">' + (data.success || 0) + ' delivered</span>' +
          '<span class="stat-fail">' + (data.failed || 0) + ' failed</span>' +
        '</div>';
    }

    function renderChannelDistChart(data) {
      const ctx = document.getElementById('channel-dist-chart');
      const emptyEl = document.getElementById('channel-dist-empty');
      if (!ctx) return;

      if (!data || data.length === 0) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (channelDistChart) { channelDistChart.destroy(); channelDistChart = null; }
        return;
      }

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

      const labels = data.map(d => d.channel || 'unknown');
      const values = data.map(d => d.count || 0);

      if (channelDistChart) channelDistChart.destroy();
      channelDistChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: chartColors.slice(0, labels.length),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' }, beginAtZero: true }
          }
        }
      });
    }

    function renderCostTrendChart(data) {
      const ctx = document.getElementById('cost-trend-chart');
      const emptyEl = document.getElementById('cost-trend-empty');
      if (!ctx) return;

      if (!data || data.length === 0) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (costTrendChart) { costTrendChart.destroy(); costTrendChart = null; }
        return;
      }

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

      const labels = data.map(d => (d.day || '').slice(5));
      const values = data.map(d => d.cost || 0);

      if (costTrendChart) costTrendChart.destroy();
      costTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cost ($)',
            data: values,
            borderColor: '#d29922',
            backgroundColor: '#d2992233',
            tension: 0.3,
            fill: true,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } },
            y: { ticks: { color: '#8b949e', font: { size: 10 }, callback: function(v) { return '$' + v; } }, grid: { color: '#21262d' }, beginAtZero: true }
          }
        }
      });
    }

    function renderPeakHoursChart(data) {
      const ctx = document.getElementById('peak-hours-chart');
      const emptyEl = document.getElementById('peak-hours-empty');
      if (!ctx) return;

      if (!data || data.length === 0) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (peakHoursChart) { peakHoursChart.destroy(); peakHoursChart = null; }
        return;
      }

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

      /* Build 0-23 hour labels */
      const hours = Array.from({length: 24}, (_, i) => i);
      const counts = hours.map(h => {
        const row = data.find(d => d.hour === h);
        return row ? row.count : 0;
      });
      const maxCount = Math.max(...counts);
      const bgColors = counts.map(c => c === maxCount && maxCount > 0 ? '#d29922' : '#58a6ff88');

      if (peakHoursChart) peakHoursChart.destroy();
      peakHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: hours.map(h => h + ':00'),
          datasets: [{
            data: counts,
            backgroundColor: bgColors,
            borderRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8b949e', font: { size: 8 }, maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' }, beginAtZero: true }
          }
        }
      });
    }

    function renderErrorRateChart(data) {
      const ctx = document.getElementById('error-rate-chart');
      const emptyEl = document.getElementById('error-rate-empty');
      if (!ctx) return;

      if (!data || data.length === 0) {
        ctx.classList.add('hidden-chart');
        if (emptyEl) emptyEl.classList.add('visible');
        if (errorRateChart) { errorRateChart.destroy(); errorRateChart = null; }
        return;
      }

      ctx.classList.remove('hidden-chart');
      if (emptyEl) emptyEl.classList.remove('visible');

      const labels = data.map(d => (d.day || '').slice(5));
      const totals = data.map(d => d.total || 0);
      const errors = data.map(d => d.errors || 0);

      if (errorRateChart) errorRateChart.destroy();
      errorRateChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Total', data: totals, borderColor: '#58a6ff', backgroundColor: '#58a6ff22', tension: 0.3, fill: true, pointRadius: 3 },
            { label: 'Errors', data: errors, borderColor: '#f85149', backgroundColor: '#f8514922', tension: 0.3, fill: true, pointRadius: 3 }
          ]
        },
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

    /* ── CSV Download Functions ─────────────────────────────── */
    function downloadCSV(filename, headers, rows) {
      const escape = (v) => {
        const s = String(v == null ? '' : v);
        return s.includes(',') || s.includes('"') || s.includes('\\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const csv = [headers.map(escape).join(',')].concat(
        rows.map(r => r.map(escape).join(','))
      ).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function downloadMessagesChart() {
      if (!_histData || !_histData.messagesByDay || _histData.messagesByDay.length === 0) return;
      const rows = _histData.messagesByDay.map(d => [d.day, d.channel || 'unknown', d.count || 0]);
      downloadCSV('messages-by-day.csv', ['Date', 'Channel', 'Count'], rows);
    }

    function downloadCostByChannel() {
      if (!_histData || !_histData.costByChannel || _histData.costByChannel.length === 0) return;
      const rows = _histData.costByChannel.map(d => [d.channel || 'unknown', d.total_cost || 0, d.count || 0]);
      downloadCSV('cost-by-channel.csv', ['Channel', 'Total Cost', 'Count'], rows);
    }

    function downloadTopContacts() {
      if (!_topContactsData || _topContactsData.length === 0) return;
      const rows = _topContactsData.map(c => [c.target_address, c.channel, c.action_count || 0, c.total_cost || 0, c.last_activity || '']);
      downloadCSV('top-contacts.csv', ['Contact', 'Channel', 'Actions', 'Cost', 'Last Activity'], rows);
    }

    function downloadRecentActivity() {
      if (!allActivity || allActivity.length === 0) return;
      const rows = allActivity.map(a => [a.actionType || '', a.channel || '', a.target || '', a.status || '', a.cost || 0, a.timestamp || '']);
      downloadCSV('recent-activity.csv', ['Type', 'Channel', 'Target', 'Status', 'Cost', 'Timestamp'], rows);
    }

    function downloadRecentAlerts() {
      if (!_dashData || !_dashData.alerts || _dashData.alerts.length === 0) return;
      const rows = _dashData.alerts.map(a => [a.severity || '', a.message || '', a.timestamp || '']);
      downloadCSV('recent-alerts.csv', ['Severity', 'Message', 'Timestamp'], rows);
    }

    function downloadChannelDist() {
      if (!_analyticsData || !_analyticsData.channelDistribution || _analyticsData.channelDistribution.length === 0) return;
      const rows = _analyticsData.channelDistribution.map(d => [d.channel || 'unknown', d.count || 0]);
      downloadCSV('channel-distribution.csv', ['Channel', 'Count'], rows);
    }

    function downloadCostTrend() {
      if (!_analyticsData || !_analyticsData.costTrend || _analyticsData.costTrend.length === 0) return;
      const rows = _analyticsData.costTrend.map(d => [d.day || '', d.cost || 0]);
      downloadCSV('cost-trend.csv', ['Date', 'Cost'], rows);
    }

    function downloadPeakHours() {
      if (!_analyticsData || !_analyticsData.peakHours || _analyticsData.peakHours.length === 0) return;
      const rows = _analyticsData.peakHours.map(d => [d.hour + ':00', d.count || 0]);
      downloadCSV('peak-hours.csv', ['Hour', 'Count'], rows);
    }

    function downloadErrorRate() {
      if (!_analyticsData || !_analyticsData.errorRate || _analyticsData.errorRate.length === 0) return;
      const rows = _analyticsData.errorRate.map(d => [d.day || '', d.total || 0, d.errors || 0]);
      downloadCSV('error-rate.csv', ['Date', 'Total', 'Errors'], rows);
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
        /* Email verification status */
        if (status.registration) {
          document.getElementById('email-verification-enabled').value = status.registration.requireEmailVerification ? 'true' : 'false';
          const evBadge = document.getElementById('email-verification-badge');
          if (evBadge) {
            evBadge.textContent = status.registration.requireEmailVerification ? 'Required' : 'Off';
            evBadge.className = 'badge ' + (status.registration.requireEmailVerification ? 'badge-success' : 'badge-info');
          }
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
      if (token) credentials.ORCHESTRATOR_SECURITY_TOKEN = token;
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
        updatePoolCapacity();
      } catch (err) {
        console.error('Agents load error:', err);
        document.getElementById('agents-body').innerHTML =
          '<tr><td colspan="7" style="color:var(--error);text-align:center;padding:1.5rem;">Failed to load agents</td></tr>';
      }
    }

    function updatePoolCapacity() {
      const el = document.getElementById('pool-capacity');
      if (!el) return;
      if (orgInfo) {
        el.textContent = agentsData.length + ' of ' + (orgInfo.poolMax || 5) + ' agent slots used';
      } else {
        el.textContent = agentsData.length + ' agent(s)';
      }
    }

    function toggleProvisionForm() {
      const form = document.getElementById('provision-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    let lastRevealedToken = '';

    async function provisionAgent() {
      const btn = document.getElementById('prov-submit-btn');
      const result = document.getElementById('prov-result');
      btn.disabled = true;
      result.textContent = 'Provisioning...';
      result.style.color = 'var(--text-muted)';

      const agentId = document.getElementById('prov-agent-id').value.trim();
      const displayName = document.getElementById('prov-display-name').value.trim();

      if (!agentId || !displayName) {
        result.textContent = 'Agent ID and Display Name are required.';
        result.style.color = 'var(--error)';
        btn.disabled = false;
        return;
      }

      const capabilities = [];
      if (document.getElementById('prov-cap-sms').checked) capabilities.push('sms');
      if (document.getElementById('prov-cap-voice').checked) capabilities.push('voice');
      if (document.getElementById('prov-cap-email').checked) capabilities.push('email');
      if (document.getElementById('prov-cap-whatsapp').checked) capabilities.push('whatsapp');

      if (capabilities.length === 0) {
        result.textContent = 'Select at least one capability.';
        result.style.color = 'var(--error)';
        btn.disabled = false;
        return;
      }

      try {
        const res = await apiFetch('/api/v1/provision', {
          method: 'POST',
          body: JSON.stringify({
            agentId,
            displayName,
            capabilities,
            country: document.getElementById('prov-country').value,
            systemPrompt: document.getElementById('prov-system-prompt').value.trim() || undefined,
            greeting: document.getElementById('prov-greeting').value.trim() || undefined,
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          result.textContent = data.error || 'Provisioning failed';
          result.style.color = 'var(--error)';
          btn.disabled = false;
          return;
        }

        /* Show token reveal modal */
        lastRevealedToken = data.securityToken || data.token || '';
        if (lastRevealedToken) {
          document.getElementById('revealed-token').textContent = lastRevealedToken;
          document.getElementById('token-reveal-modal').style.display = 'flex';
        }

        result.textContent = 'Agent provisioned!';
        result.style.color = 'var(--success)';
        document.getElementById('provision-form').style.display = 'none';

        /* Clear form */
        document.getElementById('prov-agent-id').value = '';
        document.getElementById('prov-display-name').value = '';
        document.getElementById('prov-system-prompt').value = '';
        document.getElementById('prov-greeting').value = '';
        result.textContent = '';

        loadAgents();
      } catch (err) {
        result.textContent = 'Network error';
        result.style.color = 'var(--error)';
      }
      btn.disabled = false;
    }

    function copyRevealedToken() {
      navigator.clipboard.writeText(lastRevealedToken).then(() => {
        const btn = document.getElementById('copy-revealed-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Token'; }, 2000);
      });
    }

    function closeTokenModal() {
      document.getElementById('token-reveal-modal').style.display = 'none';
      lastRevealedToken = '';
    }

    async function deprovisionAgent(agentId) {
      if (!confirm('Deprovision agent "' + agentId + '"? This will release all channels and revoke access.')) return;
      try {
        const res = await apiFetch('/api/v1/deprovision', {
          method: 'POST',
          body: JSON.stringify({ agentId })
        });
        const data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Agent deprovisioned', 'success');
          loadAgents();
        }
      } catch {
        showToast('Network error', 'error');
      }
    }

    function renderAgentsTable() {
      const body = document.getElementById('agents-body');

      if (agentsData.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:1.5rem;">No agents found. Click "+ New Agent" to provision one.</td></tr>';
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

        const blocked = (() => { try { return JSON.parse(agent.blocked_channels || '[]'); } catch { return []; } })();
        const hasBlocks = blocked.length > 0;
        let statusBadge;
        if (status !== 'active' && status !== 'ACTIVE') {
          statusBadge = '<span class="badge badge-warning">' + escHtml(status) + '</span>';
        } else if (hasBlocks) {
          const blockLabel = blocked.includes('*') ? 'all' : blocked.join(', ');
          statusBadge = '<span class="badge badge-error" title="Blocked: ' + escAttr(blockLabel) + '">Blocked (' + escHtml(blockLabel) + ')</span>';
        } else {
          statusBadge = '<span class="badge badge-success">Active</span>';
        }

        html += '<tr onclick="toggleAgentEdit(' + idx + ')" data-agent-idx="' + idx + '">' +
          '<td style="font-family:monospace;font-size:0.8rem;">' + escHtml(agentId) + '</td>' +
          '<td>' + escHtml(name) + '</td>' +
          '<td>' + escHtml(phone) + '</td>' +
          '<td>' + escHtml(email) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td><span class="badge badge-info">' + escHtml(tier) + '</span></td>' +
          '<td><button onclick="event.stopPropagation();deprovisionAgent(\\'' + escAttr(agentId) + '\\')" title="Deprovision" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:1rem;padding:4px;opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">&#10005;</button></td>' +
          '</tr>';

        /* Edit panel row */
        html += '<tr class="agent-edit-panel" id="agent-edit-' + idx + '">' +
          '<td colspan="7">' +
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
          '<div style="margin-top:0.75rem;"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveLimits(\\'' + escAttr(agentId) + '\\',' + idx + ')">Save Limits</button></div>' +
          '<hr style="border-color:var(--border);margin:0.75rem 0;">' +
          '<h4>Channel Blocking</h4>' +
          '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">' +
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px;' + (blocked.includes('*') ? 'background:var(--error-bg);color:var(--error);border-color:var(--error);' : '') + '">' +
          '<input type="checkbox" id="block-all-' + idx + '"' + (blocked.includes('*') ? ' checked' : '') + ' onchange="event.stopPropagation();onBlockAllChange(' + idx + ')" style="accent-color:var(--error);"> Block All</label>' +
          ['sms','voice','email','whatsapp','line'].map(function(ch) {
            var isBlocked = blocked.includes('*') || blocked.includes(ch);
            var disabled = blocked.includes('*') ? ' disabled' : '';
            return '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:4px;' + (isBlocked ? 'background:var(--error-bg);color:var(--error);border-color:var(--error);' : '') + '">' +
              '<input type="checkbox" id="block-' + ch + '-' + idx + '"' + (isBlocked ? ' checked' : '') + disabled + ' style="accent-color:var(--error);"> ' + ch.charAt(0).toUpperCase() + ch.slice(1) + '</label>';
          }).join('') +
          '</div>' +
          '<div style="margin-top:0.5rem;"><button class="btn btn-sm" onclick="event.stopPropagation();saveBlockedChannels(\\'' + escAttr(agentId) + '\\',' + idx + ')" style="background:var(--error);color:#fff;font-size:0.75rem;">Save Blocks</button></div>' +
          '</div>' +
          /* Right: Billing + Language */
          '<div class="edit-section">' +
          '<h4>Agent Language</h4>' +
          '<div class="field"><label>Operating Language</label>' +
          '<select id="agent-lang-' + idx + '">' +
          '<option value="en-US"' + (a.language === 'en-US' || !a.language ? ' selected' : '') + '>English (US)</option>' +
          '<option value="en-GB"' + (a.language === 'en-GB' ? ' selected' : '') + '>English (UK)</option>' +
          '<option value="es-ES"' + (a.language === 'es-ES' ? ' selected' : '') + '>Spanish (Spain)</option>' +
          '<option value="es-MX"' + (a.language === 'es-MX' ? ' selected' : '') + '>Spanish (Mexico)</option>' +
          '<option value="fr-FR"' + (a.language === 'fr-FR' ? ' selected' : '') + '>French</option>' +
          '<option value="de-DE"' + (a.language === 'de-DE' ? ' selected' : '') + '>German</option>' +
          '<option value="it-IT"' + (a.language === 'it-IT' ? ' selected' : '') + '>Italian</option>' +
          '<option value="pt-BR"' + (a.language === 'pt-BR' ? ' selected' : '') + '>Portuguese (Brazil)</option>' +
          '<option value="ja-JP"' + (a.language === 'ja-JP' ? ' selected' : '') + '>Japanese</option>' +
          '<option value="ko-KR"' + (a.language === 'ko-KR' ? ' selected' : '') + '>Korean</option>' +
          '<option value="zh-CN"' + (a.language === 'zh-CN' ? ' selected' : '') + '>Chinese (Mandarin)</option>' +
          '<option value="ar-SA"' + (a.language === 'ar-SA' ? ' selected' : '') + '>Arabic</option>' +
          '<option value="he-IL"' + (a.language === 'he-IL' ? ' selected' : '') + '>Hebrew</option>' +
          '<option value="hi-IN"' + (a.language === 'hi-IN' ? ' selected' : '') + '>Hindi</option>' +
          '<option value="nl-NL"' + (a.language === 'nl-NL' ? ' selected' : '') + '>Dutch</option>' +
          '<option value="pl-PL"' + (a.language === 'pl-PL' ? ' selected' : '') + '>Polish</option>' +
          '<option value="ru-RU"' + (a.language === 'ru-RU' ? ' selected' : '') + '>Russian</option>' +
          '<option value="sv-SE"' + (a.language === 'sv-SE' ? ' selected' : '') + '>Swedish</option>' +
          '<option value="tr-TR"' + (a.language === 'tr-TR' ? ' selected' : '') + '>Turkish</option>' +
          '</select></div>' +
          '<div style="margin-top:0.5rem;"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveAgentLanguage(\\'' + escAttr(agentId) + '\\',' + idx + ')">Save Language</button></div>' +
          '<hr style="border-color:var(--border);margin:0.75rem 0;">' +
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
          '<div style="margin-top:0.75rem;"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveBilling(\\'' + escAttr(agentId) + '\\',' + idx + ')">Save Billing</button></div>' +
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

    async function saveAgentLanguage(agentId, idx) {
      try {
        const lang = document.getElementById('agent-lang-' + idx).value;
        const res = await apiFetch('/admin/api/agents/' + encodeURIComponent(agentId) + '/language', {
          method: 'POST',
          body: JSON.stringify({ language: lang })
        });
        const data = await res.json();
        showToast(data.success ? 'Language saved: ' + lang : (data.error || 'Failed'), data.success ? 'success' : 'error');
        if (data.success) loadAgents();
      } catch {
        showToast('Network error', 'error');
      }
    }

    function onBlockAllChange(idx) {
      var blockAll = document.getElementById('block-all-' + idx).checked;
      ['sms','voice','email','whatsapp','line'].forEach(function(ch) {
        var el = document.getElementById('block-' + ch + '-' + idx);
        if (el) { el.checked = blockAll; el.disabled = blockAll; }
      });
    }

    async function saveBlockedChannels(agentId, idx) {
      try {
        var blockAll = document.getElementById('block-all-' + idx).checked;
        var channels;
        if (blockAll) {
          channels = ['*'];
        } else {
          channels = ['sms','voice','email','whatsapp','line'].filter(function(ch) {
            return document.getElementById('block-' + ch + '-' + idx).checked;
          });
        }
        const res = await apiFetch('/admin/api/agents/' + encodeURIComponent(agentId) + '/blocked-channels', {
          method: 'POST',
          body: JSON.stringify({ blockedChannels: channels })
        });
        const data = await res.json();
        showToast(data.success ? 'Channel blocks saved' : (data.error || 'Failed'), data.success ? 'success' : 'error');
        if (data.success) loadAgents();
      } catch {
        showToast('Network error', 'error');
      }
    }

    async function saveDisclosure() {
      const enabled = document.getElementById('disclosure-enabled').value;
      const text = document.getElementById('disclosure-text').value;
      try {
        var creds = { VOICE_AI_DISCLOSURE: enabled };
        if (text) creds.VOICE_AI_DISCLOSURE_TEXT = text;
        const res = await apiFetch('/admin/api/save', {
          method: 'POST',
          body: JSON.stringify({ credentials: creds })
        });
        const data = await res.json();
        showToast(data.success ? 'AI disclosure ' + (enabled === 'true' ? 'enabled' : 'disabled') : (data.message || 'Failed'), data.success ? 'success' : 'error');
        document.getElementById('disclosure-badge').textContent = enabled === 'true' ? 'Enabled' : 'Disabled';
        document.getElementById('disclosure-badge').className = 'badge ' + (enabled === 'true' ? 'badge-success' : 'badge-warning');
      } catch {
        showToast('Network error', 'error');
      }
    }

    /* ── Settings: Email Verification Toggle ─────────────────── */
    async function saveEmailVerification() {
      const enabled = document.getElementById('email-verification-enabled').value;
      try {
        const res = await apiFetch('/admin/api/save', {
          method: 'POST',
          body: JSON.stringify({ credentials: { REQUIRE_EMAIL_VERIFICATION: enabled } })
        });
        const data = await res.json();
        showToast(data.success ? 'Email verification ' + (enabled === 'true' ? 'enabled' : 'disabled') : (data.message || 'Failed'), data.success ? 'success' : 'error');
        document.getElementById('email-verification-badge').textContent = enabled === 'true' ? 'Required' : 'Off';
        document.getElementById('email-verification-badge').className = 'badge ' + (enabled === 'true' ? 'badge-success' : 'badge-info');
      } catch {
        showToast('Network error', 'error');
      }
    }

    /* ── Docs Page Helpers ────────────────────────────────────── */
    function copyText(text) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Copied!', 'success');
      });
    }

    function copyCodeBlock(btn) {
      const pre = btn.parentElement.querySelector('pre');
      const text = pre.textContent;
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      });
    }

    function toggleCollapsible(btn) {
      const content = btn.nextElementSibling;
      const isOpen = btn.classList.toggle('open');
      content.classList.toggle('open', isOpen);

      /* Lazy-load swagger the first time REST API section is opened */
      if (isOpen && content.querySelector('#swagger-container') && !swaggerLoaded) {
        initSwagger();
      }
    }

    function initDocsPage() {
      /* Fill server URLs */
      const baseUrl = (API_SPEC.servers && API_SPEC.servers[0]) ? API_SPEC.servers[0].url : window.location.origin;
      document.getElementById('docs-server-url').textContent = baseUrl;
      var urlSpans = ['curl-base-url', 'mcp-base-url', 'mcp-config-url', 'admin-base-url'];
      urlSpans.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = baseUrl;
      });
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
          layout: 'BaseLayout',
          supportedSubmitMethods: []
        });
      } catch (err) {
        document.getElementById('swagger-container').innerHTML =
          '<div class="card" style="color:var(--error);">Failed to load Swagger UI: ' + escHtml(String(err)) + '</div>';
      }
    }

    function initMcpTools() {
      var toolsContainer = document.getElementById('mcp-tools');
      var tools = API_SPEC['x-mcp-tools'] || [];
      if (tools.length === 0) {
        toolsContainer.innerHTML = '<p style="color:var(--text-muted);">No MCP tools found in spec.</p>';
        return;
      }

      toolsContainer.innerHTML = tools.map(function(tool) {
        var params = tool.parameters || {};
        var paramHtml = Object.keys(params).map(function(key) {
          var p = params[key];
          var isRequired = p.required === true;
          return '<span class="param' + (isRequired ? ' required' : '') + '">' + escHtml(key) + (isRequired ? '*' : '') + '</span>';
        }).join('');
        return '<div class="tool-card">' +
          '<div class="tool-name">' + escHtml(tool.name || '') + '</div>' +
          '<div class="tool-desc">' + escHtml(tool.description || '') + '</div>' +
          (paramHtml ? '<div class="tool-params">' + paramHtml + '</div>' : '') +
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

    function timeAgo(ts) {
      const now = Date.now();
      const then = new Date(ts).getTime();
      const diff = Math.max(0, Math.floor((now - then) / 1000));
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }
  </script>
</body>
</html>`;
}
