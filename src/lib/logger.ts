import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = config.nodeEnv === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/** Redact token= query params from URLs before logging. */
export function sanitizeUrl(url: string): string {
  return url.replace(/([?&])token=[^&]*/g, "$1token=***");
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
};
