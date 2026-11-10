"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { applyOpAction } from "@/app/(app)/outbox-actions";
import type { Op } from "@/modules/ops/outbox";
import {
  backoffMs,
  classifyThrown,
  isRetryable,
  syncMessage,
  type SyncErrorKind,
} from "@/modules/sync/errors";
import { accountStorage, currentAccount, registerAccountStore, writeShared } from "./device/scope";
import { withStoreLock } from "./device/tabs";

// Quick logs (food, water, check-ins, body entries) made while offline wait here, in
// IndexedDB under the signed-in account, and are sent in order once the connection is
// back. Each carries an id the server remembers, so a retry never doubles an entry.
//
// A failure is sorted by kind: brief ones (offline, busy, rate-limited) are retried with
// backoff; ones that won't fix themselves (refused data, another account) move to
// `failed`, where they're kept until the person retries or removes them, and don't hold
// up the rest of the queue.

export type QueuedOp = Op & {
  queuedAt: number;
  attempts: number;
  /** The account that made it; never sent while another account is signed in. */
  owner?: string;
  /** Earliest time to try again after a brief failure. */
  notBefore?: number;
};

export type FailedOp = { op: QueuedOp; kind: SyncErrorKind; error: string; at: number };

/** The op as the server takes it, without the queue's bookkeeping. */
export const opOf = ({ id, kind, payload }: QueuedOp) => ({ id, kind, payload }) as Op;

type State = {
  ops: QueuedOp[];
  /** Ops the server refused. Kept until the person retries or removes each one. */
  failed: FailedOp[];
  /** Set when sending is paused until the person acts (signed out, app updated). */
  blocked: SyncErrorKind | null;
  add: (op: Op) => void;
  remove: (id: string) => void;
  fail: (id: string, kind: SyncErrorKind, error: string) => void;
  /** Counts a brief failure and sets when to try this op again. */
  tried: (id: string) => void;
  retryFailed: (id: string) => void;
  removeFailed: (id: string) => void;
  setBlocked: (kind: SyncErrorKind | null) => void;
};

const empty = { ops: [] as QueuedOp[], failed: [] as FailedOp[], blocked: null };

export const useOutbox = create<State>()(
  persist(
    (set) => ({
      ...empty,
      add: (op) =>
        set((s) => ({
          ops: [
            ...s.ops,
            {
              ...op,
              queuedAt: Date.now(),
              attempts: 0,
              owner: currentAccount() ?? undefined,
            } as QueuedOp,
          ],
        })),
      remove: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      fail: (id, kind, error) =>
        set((s) => {
          const op = s.ops.find((o) => o.id === id);
          return {
            ops: s.ops.filter((o) => o.id !== id),
            failed: op ? [...s.failed, { op, kind, error, at: Date.now() }] : s.failed,
          };
        }),
      tried: (id) =>
        set((s) => ({
          ops: s.ops.map((o) =>
            o.id === id
              ? { ...o, attempts: o.attempts + 1, notBefore: Date.now() + backoffMs(o.attempts) }
              : o,
          ),
        })),
      retryFailed: (id) =>
        set((s) => {
          const f = s.failed.find((x) => x.op.id === id);
          if (!f) return {};
          return {
            failed: s.failed.filter((x) => x.op.id !== id),
            // The person chose to send it, so it counts as queued now.
            ops: [...s.ops, { ...f.op, attempts: 0, notBefore: undefined, queuedAt: Date.now() }],
          };
        }),
      removeFailed: (id) => set((s) => ({ failed: s.failed.filter((x) => x.op.id !== id) })),
      setBlocked: (blocked) => set({ blocked }),
    }),
    {
      name: "reptr-outbox",
      storage: createJSONStorage(() => accountStorage),
      skipHydration: true,
      partialize: ({ ops, failed }) => ({ ops, failed }),
    },
  ),
);

registerAccountStore(
  useOutbox,
  () => useOutbox.setState({ ...empty }),
  ({ ops, failed }) =>
    (ops === undefined || Array.isArray(ops)) && (failed === undefined || Array.isArray(failed)),
);

/**
 * Changes the queue safely when several tabs are open: under a lock, from the latest
 * saved copy, saved before the lock is let go. Every change to the queue goes through here.
 */
export async function mutateOutbox(fn: (s: State) => void) {
  await withStoreLock("reptr-outbox", async () => {
    await useOutbox.persist.rehydrate();
    fn(useOutbox.getState());
    const { ops, failed } = useOutbox.getState();
    await writeShared("reptr-outbox", JSON.stringify({ state: { ops, failed }, version: 0 }));
  });
}

/** True while this device holds quick logs the server hasn't taken. */
export function hasUnsyncedOps() {
  const s = useOutbox.getState();
  return s.ops.length > 0 || s.failed.length > 0;
}

export type SendResult = { error?: string; queued?: boolean };

/**
 * Sends a quick log now, or queues it when the network is down. A refused value comes
 * back as an error to show in the form; a dropped connection queues it for later.
 */
export async function sendOrQueue(
  kind: Op["kind"],
  // Checked on the server, which is the one that has to trust it.
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const op = { id: crypto.randomUUID(), kind, payload } as Op;
  // Anything already waiting goes first, so changes reach the server in order.
  if (useOutbox.getState().ops.length || (typeof navigator !== "undefined" && !navigator.onLine)) {
    await mutateOutbox((s) => s.add(op));
    return { queued: true };
  }
  try {
    const res = await applyOpAction(op, currentAccount() ?? undefined);
    if (res.ok) return {};
    if (isRetryable(res.kind)) {
      await mutateOutbox((s) => s.add(op));
      return { queued: true };
    }
    return { error: res.kind === "validation" ? res.error : syncMessage(res.kind, res.error) };
  } catch (err) {
    if (classifyThrown(err) === "stale_build") useOutbox.getState().setBlocked("stale_build");
    await mutateOutbox((s) => s.add(op));
    return { queued: true };
  }
}

export const queuedMessage = "Saved on this device. It will sync when you're back online.";
