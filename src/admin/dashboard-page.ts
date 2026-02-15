/**
 * Admin dashboard — shows agent status, costs, alerts, and system health.
 * Self-contained HTML with inline CSS/JS. Fetches data from admin API endpoints.
 */

import { config } from "../lib/config.js";

export function renderDashboardPage(): string {
  const demoBanner = config.demoMode
    ? `<div style="background:#f59e0b;color:#000;padding:10px;text-align:center;font-weight:bold;">DEMO MODE</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — ${config.mcpServerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f0f23; color: #e0e0e0; }
    .header { background: #16213e; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 20px; color: #4fc3f7; }
    .header nav a { color: #90a4ae; text-decoration: none; margin-left: 16px; font-size: 14px; }
    .header nav a:hover { color: #4fc3f7; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; padding: 24px; max-width: 1400px; margin: 0 auto; }
    .card { background: #16213e; border-radius: 8px; padding: 20px; }
    .card h2 { color: #4fc3f7; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid #1a3a5c; padding-bottom: 8px; }
    .stat { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1a2a3e; }
    .stat:last-child { border-bottom: none; }
    .stat .label { color: #90a4ae; font-size: 14px; }
    .stat .value { color: #e0e0e0; font-weight: 600; font-size: 14px; }
    .status-ok { color: #4caf50; }
    .status-warn { color: #ff9800; }
    .status-error { color: #f44336; }
    .agent-row { background: #0f3460; padding: 12px; border-radius: 6px; margin-bottom: 8px; }
    .agent-row .name { font-weight: bold; color: #4fc3f7; }
    .agent-row .details { font-size: 13px; color: #90a4ae; margin-top: 4px; }
    .alert-item { padding: 8px 12px; border-radius: 4px; margin-bottom: 6px; font-size: 13px; }
    .alert-critical { background: #b71c1c; }
    .alert-high { background: #e65100; }
    .alert-medium { background: #f57f17; color: #000; }
    .alert-low { background: #1b5e20; }
    .refresh-btn { background: #0f3460; color: #4fc3f7; border: 1px solid #4fc3f7; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .refresh-btn:hover { background: #4fc3f7; color: #0f0f23; }
    #loading { text-align: center; padding: 40px; color: #90a4ae; }
    .big-number { font-size: 32px; font-weight: bold; color: #4fc3f7; }
  </style>
</head>
<body>
  ${demoBanner}
  <div class="header">
    <h1>Admin Dashboard</h1>
    <nav>
      <a href="/admin/setup">Setup</a>
      <a href="/admin/api-docs">API Docs</a>
      <a href="/health">Health</a>
      <a href="/metrics">Metrics</a>
      <button class="refresh-btn" onclick="loadAll()">Refresh</button>
    </nav>
  </div>
  <div id="loading">Loading dashboard data...</div>
  <div class="grid" id="dashboard" style="display:none">
    <div class="card">
      <h2>System Health</h2>
      <div id="health-stats"></div>
    </div>
    <div class="card">
      <h2>Provider Status</h2>
      <div id="provider-stats"></div>
    </div>
    <div class="card" style="grid-column: span 2">
      <h2>Active Agents</h2>
      <div id="agent-list"></div>
    </div>
    <div class="card">
      <h2>Usage Summary</h2>
      <div id="usage-stats"></div>
    </div>
    <div class="card">
      <h2>Recent Alerts</h2>
      <div id="alerts-list"></div>
    </div>
  </div>
  <script>
    async function fetchJson(url) {
      try {
        const resp = await fetch(url);
        return await resp.json();
      } catch (e) {
        return null;
      }
    }

    async function loadAll() {
      const [health, ready, provStatus] = await Promise.all([
        fetchJson('/health'),
        fetchJson('/health/ready'),
        fetchJson('/admin/api/status'),
      ]);

      // Also get dashboard-specific data
      const dashData = await fetchJson('/admin/api/dashboard');

      document.getElementById('loading').style.display = 'none';
      document.getElementById('dashboard').style.display = 'grid';

      // Health
      const hs = document.getElementById('health-stats');
      if (health) {
        const uptimeMin = Math.floor(health.uptime / 60);
        hs.innerHTML =
          stat('Status', health.status, 'status-ok') +
          stat('Uptime', uptimeMin + ' min') +
          stat('Version', health.version) +
          stat('Environment', health.environment) +
          stat('Demo Mode', health.demoMode ? 'Yes' : 'No', health.demoMode ? 'status-warn' : '');
      }

      // Providers
      const ps = document.getElementById('provider-stats');
      if (ready && ready.providers) {
        ps.innerHTML = Object.entries(ready.providers).map(([k, v]) =>
          stat(k, v, v === 'ok' || v === 'configured' ? 'status-ok' : 'status-warn')
        ).join('');
      }

      // Agents
      const al = document.getElementById('agent-list');
      if (dashData && dashData.agents && dashData.agents.length > 0) {
        al.innerHTML = dashData.agents.map(a =>
          '<div class="agent-row">' +
          '<div class="name">' + a.agent_id + '</div>' +
          '<div class="details">Phone: ' + (a.phone_number || 'N/A') +
          ' | Email: ' + (a.email_address || 'N/A') +
          ' | Status: ' + a.status + '</div></div>'
        ).join('');
      } else {
        al.innerHTML = '<div style="color:#90a4ae;padding:8px">No agents provisioned yet.</div>';
      }

      // Usage
      const us = document.getElementById('usage-stats');
      if (dashData && dashData.usage) {
        us.innerHTML =
          stat('Total Messages', dashData.usage.totalMessages) +
          stat('Today\\'s Actions', dashData.usage.todayActions) +
          stat('Total Cost', '$' + (dashData.usage.totalCost || 0).toFixed(2));
      } else {
        us.innerHTML = stat('Total Messages', '0') + stat('Today\\'s Actions', '0');
      }

      // Alerts
      const als = document.getElementById('alerts-list');
      if (dashData && dashData.alerts && dashData.alerts.length > 0) {
        als.innerHTML = dashData.alerts.map(a =>
          '<div class="alert-item alert-' + a.severity.toLowerCase() + '">' +
          '<strong>' + a.severity + ':</strong> ' + a.message +
          ' <span style="font-size:11px;opacity:0.7">(' + a.timestamp + ')</span></div>'
        ).join('');
      } else {
        als.innerHTML = '<div style="color:#90a4ae;padding:8px">No recent alerts.</div>';
      }
    }

    function stat(label, value, cls) {
      return '<div class="stat"><span class="label">' + label +
        '</span><span class="value ' + (cls || '') + '">' + value + '</span></div>';
    }

    loadAll();
    setInterval(loadAll, 30000);
  </script>
</body>
</html>`;
}
