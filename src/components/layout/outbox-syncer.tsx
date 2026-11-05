"use client";

import { CloudOff, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { applyOpAction } from "@/app/(app)/outbox-actions";
import { opOf, useOutbox } from "@/lib/outbox";

const RETRY_MS = [3000, 10000, 30000, 60000];

/**
 * Replays queued quick logs in order whenever the app is online: on load, when the
 * connection or the tab comes back, and with backoff after a failure. Shows a small
 * badge while anything is waiting.
 */
export function OutboxSyncer() {
  const router = useRouter();
  const ops = useOutbox((s) => s.ops.length);
  const failed = useOutbox((s) => s.failed);
  const running = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, ms);
    };
    const run = async () => {
      if (running.current) return;
      running.current = true;
      let sent = 0;
      try {
        while (true) {
          const next = useOutbox.getState().ops[0];
          if (!next) break;
          let res: Awaited<ReturnType<typeof applyOpAction>>;
          try {
            res = await applyOpAction(opOf(next));
          } catch {
            // Still offline: try again later.
            useOutbox.getState().tried(next.id);
            schedule(RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)]);
            return;
          }
          if (res.ok) {
            useOutbox.getState().remove(next.id);
            sent++;
          } else if (res.retry) {
            schedule(60000);
            return;
          } else {
            useOutbox.getState().fail(next.id, res.error);
          }
          attempt.current = 0;
        }
      } finally {
        running.current = false;
        if (sent) router.refresh();
      }
    };
    const now = () => {
      attempt.current = 0;
      schedule(0);
    };
    const onVisible = () => document.visibilityState === "visible" && now();
    const unsubscribe = useOutbox.subscribe((s, prev) => {
      if (s.ops.length > prev.ops.length) schedule(1000);
    });
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", onVisible);
    // The persisted queue loads from IndexedDB asynchronously; start once it has.
    const unhydrated = useOutbox.persist.onFinishHydration(() => now());
    if (useOutbox.persist.hasHydrated()) now();
    return () => {
      unsubscribe();
      unhydrated();
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  if (!ops && !failed.length) return null;
  return (
    <div
      role="status"
      className="bg-card border-border fixed right-4 bottom-20 z-40 flex max-w-xs items-start gap-2 rounded-xl border p-3 text-sm shadow-lg md:bottom-4"
    >
      {ops ? (
        <>
          <CloudOff className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span>
            {ops} change{ops === 1 ? "" : "s"} waiting to sync
          </span>
        </>
      ) : (
        <>
          <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" />
          <span>
            {failed.length === 1
              ? `An offline change couldn't be saved: ${failed[0].error}`
              : `${failed.length} offline changes couldn't be saved. The first: ${failed[0].error}`}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => useOutbox.getState().dismissFailed()}
          >
            <X className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}
