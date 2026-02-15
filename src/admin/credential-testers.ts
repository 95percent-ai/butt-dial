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
