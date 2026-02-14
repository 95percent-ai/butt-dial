<!-- version: 1.0 | updated: 2026-02-13 -->

# Errors — Pattern Library

### MCP transport body consumed by Express
**Pattern:** POST to `/messages` returns 400 or "stream is not readable" error. MCP tool listing fails.
**Cause:** `express.json()` middleware consumes the request body stream before `SSEServerTransport.handlePostMessage()` can read it.
**Fix:** Mount MCP routes (`/sse`, `/messages`) before `app.use(express.json())`. The transport needs the raw stream.
