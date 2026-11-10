// Structured server logs: one JSON object per line, which Vercel and most log tools can
// search and filter. Secrets and contact details are masked before anything is written.

import { after } from "next/server";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE = /(pass(word)?|secret|token|api_?key|authorization|cookie|email)/i;

function clean(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split("\n").slice(0, 8),
    };
  }
  if (depth > 4 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SENSITIVE.test(k) ? "[redacted]" : clean(v, depth + 1),
    ]),
  );
}

export function formatLine(level: Level, event: string, fields: Fields = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(clean(fields) as Fields),
  });
}

/** Same event reported at most once a minute per server instance, so an outage is one alert, not hundreds. */
const ALERT_EVERY_MS = 60_000;
const lastAlert = new Map<string, number>();

export function shouldAlert(event: string, now = Date.now()) {
  const last = lastAlert.get(event) ?? 0;
  if (now - last < ALERT_EVERY_MS) return false;
  lastAlert.set(event, now);
  return true;
}

/**
 * Errors are also sent to ERROR_WEBHOOK_URL when it's set (any endpoint that takes a JSON
 * POST: a Slack or Discord webhook, or an error tracker's ingest URL). The send is handed
 * to Next's after(), so a serverless function isn't frozen before it finishes; outside a
 * request it's sent directly. Delivery failures are written to the log.
 */
function report(event: string, line: string) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url || !shouldAlert(event)) return;
  const text = line.length > 3500 ? `${line.slice(0, 3500)}…` : line;
  const send = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) console.warn(formatLine("warn", "alert_rejected", { status: res.status }));
      })
      .catch((err) => console.warn(formatLine("warn", "alert_failed", { err })));
  try {
    after(send);
  } catch {
    void send();
  }
}

/**
 * Runs a piece of server work and logs it as slow when it takes longer than expected,
 * with its name and duration, so slow actions show up in the logs and alerts.
 */
export async function timed<T>(name: string, fn: () => Promise<T>, slowMs = 2000): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    if (ms > slowMs) console.warn(formatLine("warn", "slow_request", { name, ms }));
  }
}

export const log = {
  info: (event: string, fields?: Fields) => console.info(formatLine("info", event, fields)),
  warn: (event: string, fields?: Fields) => console.warn(formatLine("warn", event, fields)),
  error: (event: string, fields?: Fields) => {
    const line = formatLine("error", event, fields);
    console.error(line);
    report(event, line);
  },
};
