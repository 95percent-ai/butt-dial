interface TestResult {
  success: boolean;
  message: string;
}

/** Test Twilio credentials by calling GET /Accounts/{sid}.json */
export async function testTwilioCredentials(
  accountSid: string,
  authToken: string
): Promise<TestResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        return { success: false, message: "Invalid Account SID or Auth Token" };
      }
      return { success: false, message: `Twilio API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { friendly_name?: string };
    return {
      success: true,
      message: `Connected — account: ${data.friendly_name ?? accountSid}`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test Resend credentials by calling GET /domains */
export async function testResendCredentials(
  apiKey: string
): Promise<TestResult> {
  const url = "https://api.resend.com/domains";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: "Invalid API key" };
      }
      const body = await response.text();
      return { success: false, message: `Resend API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { data?: unknown[] };
    const count = data.data?.length ?? 0;
    return {
      success: true,
      message: `Connected — ${count} domain${count === 1 ? "" : "s"} configured`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test ElevenLabs credentials by calling GET /v1/voices */
export async function testElevenLabsCredentials(
  apiKey: string
): Promise<TestResult> {
  const url = "https://api.elevenlabs.io/v1/voices";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Invalid API key" };
      }
      const body = await response.text();
      return { success: false, message: `ElevenLabs API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { voices?: unknown[] };
    const count = data.voices?.length ?? 0;
    return {
      success: true,
      message: `Connected — ${count} voice${count === 1 ? "" : "s"} available`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test Anthropic credentials by calling GET /v1/models */
export async function testAnthropicCredentials(
  apiKey: string
): Promise<TestResult> {
  const url = "https://api.anthropic.com/v1/models";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Invalid API key" };
      }
      const body = await response.text();
      return { success: false, message: `Anthropic API error ${response.status}: ${body.slice(0, 200)}` };
    }

    return { success: true, message: "Connected — Anthropic API key valid" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test OpenAI credentials by calling GET /v1/models */
export async function testOpenAICredentials(
  apiKey: string
): Promise<TestResult> {
  const url = "https://api.openai.com/v1/models";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Invalid API key" };
      }
      const body = await response.text();
      return { success: false, message: `OpenAI API error ${response.status}: ${body.slice(0, 200)}` };
    }

    return { success: true, message: "Connected — OpenAI API key valid" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test Deepgram credentials by calling GET /v1/projects */
export async function testDeepgramCredentials(
  apiKey: string
): Promise<TestResult> {
  const url = "https://api.deepgram.com/v1/projects";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: "Invalid API key" };
      }
      const body = await response.text();
      return { success: false, message: `Deepgram API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { projects?: unknown[] };
    const count = data.projects?.length ?? 0;
    return {
      success: true,
      message: `Connected — ${count} project${count === 1 ? "" : "s"} found`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test Vonage credentials by calling GET /account/get-balance */
export async function testVonageCredentials(
  apiKey: string,
  apiSecret: string
): Promise<TestResult> {
  const url = `https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Invalid API key or secret" };
      }
      const body = await response.text();
      return { success: false, message: `Vonage API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { value?: number };
    const balance = data.value != null ? `€${Number(data.value).toFixed(2)}` : "unknown";
    return {
      success: true,
      message: `Connected — balance: ${balance}`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}

/** Test LINE credentials by calling GET /v2/bot/info */
export async function testLINECredentials(
  channelAccessToken: string
): Promise<TestResult> {
  const url = "https://api.line.me/v2/bot/info";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${channelAccessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Invalid channel access token" };
      }
      const body = await response.text();
      return { success: false, message: `LINE API error ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { displayName?: string };
    return {
      success: true,
      message: `Connected — bot: ${data.displayName ?? "OK"}`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, message: "Connection timed out (10s)" };
    }
    return { success: false, message: `Connection failed: ${String(err)}` };
  }
}
