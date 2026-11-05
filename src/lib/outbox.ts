"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { applyOpAction } from "@/app/(app)/outbox-actions";
import type { Op } from "@/modules/ops/outbox";
import { idbStorage } from "./workout-store";

// Quick logs (food, water, check-ins, body entries) made while offline wait here, in
// IndexedDB, and are sent in order once the connection is back. Each carries an id the
// server remembers, so a retry never doubles an entry.

export type QueuedOp = Op & { queuedAt: number; attempts: number };

/** The op as the server takes it, without the queue's bookkeeping. */
export const opOf = ({ id, kind, payload }: QueuedOp) => ({ id, kind, payload }) as Op;

type State = {
  ops: QueuedOp[];
  /** Ops the server refused (for example, a value out of range), so they're not retried. */
  failed: { op: QueuedOp; error: string }[];
  add: (op: Op) => void;
  remove: (id: string) => void;
  fail: (id: string, error: string) => void;
  tried: (id: string) => void;
  dismissFailed: () => void;
};

export const useOutbox = create<State>()(
  persist(
    (set) => ({
      ops: [],
      failed: [],
      add: (op) =>
        set((s) => ({ ops: [...s.ops, { ...op, queuedAt: Date.now(), attempts: 0 } as QueuedOp] })),
      remove: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      fail: (id, error) =>
        set((s) => {
          const op = s.ops.find((o) => o.id === id);
          return {
            ops: s.ops.filter((o) => o.id !== id),
            failed: op ? [...s.failed, { op, error }].slice(-10) : s.failed,
          };
        }),
      tried: (id) =>
        set((s) => ({
          ops: s.ops.map((o) => (o.id === id ? { ...o, attempts: o.attempts + 1 } : o)),
        })),
      dismissFailed: () => set({ failed: [] }),
    }),
    { name: "reptr-outbox", storage: createJSONStorage(() => idbStorage) },
  ),
);

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
    useOutbox.getState().add(op);
    return { queued: true };
  }
  try {
    const res = await applyOpAction(op);
    if (res.ok) return {};
    if (res.retry) {
      useOutbox.getState().add(op);
      return { queued: true };
    }
    return { error: res.error };
  } catch {
    useOutbox.getState().add(op);
    return { queued: true };
  }
}

export const queuedMessage = "Saved on this device. It will sync when you're back online.";
