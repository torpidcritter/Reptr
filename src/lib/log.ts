// Structured server logs: one JSON object per line, which Vercel and most log tools can
// search and filter. Secrets and contact details are masked before anything is written.

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

/**
 * Errors are also sent to ERROR_WEBHOOK_URL when it's set (any endpoint that takes a JSON
 * POST, such as a Slack or Discord webhook or an error tracker's ingest URL).
 */
function report(line: string) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const text = line.length > 3500 ? `${line.slice(0, 3500)}…` : line;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

export const log = {
  info: (event: string, fields?: Fields) => console.info(formatLine("info", event, fields)),
  warn: (event: string, fields?: Fields) => console.warn(formatLine("warn", event, fields)),
  error: (event: string, fields?: Fields) => {
    const line = formatLine("error", event, fields);
    console.error(line);
    report(line);
  },
};
