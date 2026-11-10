// One vocabulary for why a save from a device didn't go through, shared by the server
// actions that report it and the device queues that act on it. Each kind decides one
// thing: retry later, wait for the person, or stop trying this one item.

export type SyncErrorKind =
  /** No connection, or the request never got an answer. */
  | "network"
  /** Signed out, or the session ran out. Retry after signing in again. */
  | "auth"
  /** Signed in, but not allowed to touch this item. */
  | "forbidden"
  /** The data itself was refused (out of range, unknown exercise). Retrying won't help. */
  | "validation"
  /** Too many saves too quickly. Retry after a pause. */
  | "rate_limited"
  /** Another device changed the same thing. The person decides. */
  | "conflict"
  /** The server failed in a way that won't fix itself. */
  | "server_permanent"
  /** The server failed, probably briefly (database busy, timeout). */
  | "server_transient"
  /** This tab runs an older version of the app than the server. Reload to continue. */
  | "stale_build";

/** A failed save. Conflicts carry their own details, so they have their own shape. */
export type SyncFailure = { ok: false; kind: Exclude<SyncErrorKind, "conflict">; error: string };

const RETRYABLE: ReadonlySet<SyncErrorKind> = new Set([
  "network",
  "rate_limited",
  "server_transient",
]);

/** Kinds that clear up on their own, so the queue should try again with backoff. */
export const isRetryable = (kind: SyncErrorKind) => RETRYABLE.has(kind);

/** Kinds that need the person to act (sign in, reload, choose) before anything is retried. */
export const needsPerson = (kind: SyncErrorKind) =>
  kind === "auth" || kind === "stale_build" || kind === "conflict";

/**
 * Exponential backoff with jitter: about 2 s, 4 s, 8 s ... up to 5 minutes. The jitter
 * stops many devices that went offline together from all retrying at the same moment.
 */
export function backoffMs(attempt: number, random = Math.random) {
  const base = Math.min(300_000, 2000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * Sorts an error thrown by a server action call on the device. Next.js throws when the
 * action no longer exists on the server (a deployment happened since this tab loaded);
 * the browser throws a TypeError when there's no connection.
 */
export function classifyThrown(err: unknown): SyncErrorKind {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/server action/i.test(message) && /(not found|failed to find|was not found)/i.test(message)) {
    return "stale_build";
  }
  if (/unexpected response|failed-to-find-server-action/i.test(message)) return "stale_build";
  if (err instanceof TypeError || /network|fetch|load failed|offline/i.test(message)) {
    return "network";
  }
  return "server_transient";
}

/** What to tell the person, in their terms. */
export function syncMessage(kind: SyncErrorKind, detail?: string) {
  switch (kind) {
    case "network":
      return "Offline. Saved on this device, it will sync when you're back online.";
    case "auth":
      return "You've been signed out. Sign in again and your changes will sync.";
    case "forbidden":
      return "This change belongs to a different account, so it wasn't saved there.";
    case "validation":
      return detail ? `Not saved: ${detail}` : "Not saved: something in this entry was refused.";
    case "rate_limited":
      return "Saving is paused for a moment. It will retry by itself.";
    case "conflict":
      return detail ?? "Another device changed this. Choose what to keep.";
    case "stale_build":
      return "Reptr was updated. Reload to keep syncing; nothing on this device is lost.";
    case "server_permanent":
      return "The server couldn't save this. It's kept here; you can retry or remove it.";
    case "server_transient":
      return "The server is busy. Saved on this device, retrying shortly.";
  }
}
