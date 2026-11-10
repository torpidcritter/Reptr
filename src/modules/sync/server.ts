import "server-only";
import { log } from "@/lib/log";
import type { SyncFailure } from "./errors";

/**
 * Sorts an error thrown while applying a device's change on the server. Database errors
 * that come and go (connection drops, timeouts, deadlocks, pool exhaustion) are
 * transient; constraint violations mean the data can't go in as it is.
 */
export function classifyServerError(err: unknown): SyncFailure["kind"] {
  const code = (err as { code?: string } | null)?.code ?? "";
  // 23xxx integrity constraint violations, 22xxx data exceptions.
  if (code.startsWith("23") || code.startsWith("22")) return "validation";
  // 42501 insufficient privilege (row-level security).
  if (code === "42501") return "forbidden";
  return "server_transient";
}

/** Logs an unexpected failure and returns it in the shape devices understand. */
export function failure(event: string, err: unknown): SyncFailure {
  const kind = classifyServerError(err);
  log.error(event, { err, kind });
  return {
    ok: false,
    kind,
    error:
      kind === "validation"
        ? "That change was refused by the database."
        : "The server couldn't save this right now.",
  };
}
