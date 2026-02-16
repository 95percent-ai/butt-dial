/**
 * Swagger UI page — renders interactive API documentation.
 * Uses Swagger UI from CDN (no local dependencies).
 * Shows demo mode banner when active.
 */

import { config } from "../lib/config.js";

export function renderSwaggerPage(specJson: string): string {
  const demoBanner = config.demoMode
    ? `<div style="background:#f59e0b;color:#000;padding:12px 20px;text-align:center;font-weight:bold;font-size:14px;">
        DEMO MODE — All API calls use mock providers. No real messages are sent.
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Docs — ${config.mcpServerName}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #1a1a2e; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { max-width: 1200px; margin: 0 auto; }
    .mcp-tools-section {
      max-width: 1200px; margin: 20px auto; padding: 20px;
      background: #16213e; border-radius: 8px; color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .mcp-tools-section h2 { color: #4fc3f7; margin-top: 0; }
    .mcp-tools-section h3 { color: #81d4fa; }
    .tool-card {
      background: #0f3460; padding: 16px; border-radius: 6px;
      margin-bottom: 12px; border-left: 3px solid #4fc3f7;
    }
    .tool-card .name { font-weight: bold; color: #4fc3f7; font-size: 16px; }
    .tool-card .desc { color: #b0bec5; margin: 6px 0; }
    .tool-card .params { font-size: 13px; color: #90a4ae; }
    .tool-card .param-name { color: #4fc3f7; font-family: monospace; }
    .header-banner {
      max-width: 1200px; margin: 20px auto 0; padding: 20px;
      background: #16213e; border-radius: 8px; color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .header-banner h1 { color: #4fc3f7; margin-top: 0; }
    .header-banner a { color: #4fc3f7; }
  </style>
</head>
<body>
  ${demoBanner}
  <div class="header-banner">
    <h1>Butt-Dial Communication API</h1>
    <p>This server exposes both <strong>REST endpoints</strong> (documented below via Swagger) and <strong>MCP tools</strong> (accessed via SSE transport).</p>
    <p><a href="/admin/setup">Setup Wizard</a> | <a href="/health">Health Check</a> | <a href="/metrics">Metrics</a></p>
  </div>
  <div id="swagger-ui"></div>
  <div class="mcp-tools-section">
    <h2>MCP Tools Reference</h2>
    <p>These tools are accessed via the MCP protocol over the <code>/sse</code> endpoint, not REST. Connect with any MCP client to use them.</p>
    <div id="mcp-tools"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const spec = ${specJson};

    SwaggerUIBundle({
      spec: spec,
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout",
    });

    // Render MCP tools
    const toolsContainer = document.getElementById('mcp-tools');
    const tools = spec['x-mcp-tools'] || [];
    tools.forEach(tool => {
      const params = tool.parameters || {};
      const paramHtml = Object.entries(params).map(([k, v]) => {
        const info = v;
        const req = info.required ? ' <em>(required)</em>' : '';
        const type = info.type || 'string';
        return '<span class="param-name">' + k + '</span>: ' + type + req;
      }).join('<br>');

      toolsContainer.innerHTML += '<div class="tool-card">' +
        '<div class="name">' + tool.name + '</div>' +
        '<div class="desc">' + (tool.description || '') + '</div>' +
        (paramHtml ? '<div class="params">' + paramHtml + '</div>' : '') +
        '</div>';
    });
  </script>
</body>
</html>`;
}
