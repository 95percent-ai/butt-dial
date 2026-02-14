<!-- version: 1.0 | updated: 2026-02-12 -->
<!-- Source: https://www.twilio.com/en-us/blog/deploy-mcp-server-serverless-functions -->

# Deploy Twilio MCP Server with Serverless Functions

## Overview

Tutorial for building, deploying, and integrating a Twilio MCP server using Twilio Functions. Uses OpenAI's Responses API to automate tasks like purchasing phone numbers and sending SMS.

## Prerequisites

- Twilio account
- Twilio CLI + Serverless Toolkit plugin
- Node.js

```bash
npm install -g twilio-cli
twilio plugins:install @twilio-labs/plugin-serverless
```

## Setup

### 1. Initialize Project

```bash
twilio serverless:init mcp-tutorial --template=mcp-server
```

### 2. Environment Variables

```
ACCOUNT_SID=AC...
AUTH_TOKEN=...
API_KEY=SK...      # Restricted API Key recommended
API_SECRET=...
```

### 3. Local Testing with MCP Inspector

```bash
twilio serverless:start
# In separate terminal:
npx @modelcontextprotocol/inspector
```

Connect via Inspector UI:
- Transport: Streamable HTTP
- URL: `http://localhost:3000/mcp`

Filter services with query params:
```
http://localhost:3000/mcp?services=Messaging
http://localhost:3000/mcp?services=Serverless&services=Studio
```

### 4. Deploy

```bash
twilio serverless:deploy --runtime node20
```

Returns a publicly accessible URL for the MCP server.

## Integration with OpenAI Responses API

```javascript
import dotenv from "dotenv";
import twilio from "twilio";
import OpenAI from "openai";
dotenv.config();

const openai = new OpenAI();
const url = "https://<YOUR_MCP_URL_DOMAIN>/mcp?services=Messaging";

// Authentication: Twilio signature verification
const signature = twilio.getExpectedTwilioSignature(
  process.env.AUTH_TOKEN,
  url,
  {},
);

const response = await openai.responses.create({
  model: "o3",
  instructions: "You have access to Twilio Messaging APIs as Tools...",
  input: "Purchase a phone number and send an SMS...",
  tools: [
    {
      type: "mcp",
      server_label: "twilio",
      server_url: url,
      require_approval: "never",  // Use "always" in production
      headers: {
        "x-twilio-signature": signature,
      },
    },
  ],
});
```

## Key Architecture Details

- MCP server built as Twilio Function (Node.js 20 runtime)
- Uses Streamable HTTP transport protocol
- Exposes Twilio API tools filtered by service query parameter
- Remote connections require X-Twilio-Signature authentication
- Available services: Messaging, Phone Numbers, Serverless, Studio, etc.

## Monitoring

```bash
# Stream logs
twilio serverless:logs --tail

# Target specific function
twilio serverless:logs --tail --function-sid <SID>
```

## Key Takeaway for Our Project

This shows Twilio's official MCP server pattern using serverless functions. Our project builds a custom MCP server (not using Twilio's template) but the authentication pattern (X-Twilio-Signature) and the service-based tool filtering concept are relevant reference points.
