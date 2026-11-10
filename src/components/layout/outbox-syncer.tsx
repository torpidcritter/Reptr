"use client";

import { CloudOff, RotateCw, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { applyOpAction } from "@/app/(app)/outbox-actions";
import { currentAccount } from "@/lib/device/scope";
import { syncPaused } from "@/lib/device/session";
import { opOf, useOutbox } from "@/lib/outbox";
import { classifyThrown, isRetryable, needsPerson, syncMessage } from "@/modules/sync/errors";

/**
 * Replays queued quick logs in order whenever the app is online: on load, when the
 * connection or the tab comes back, and with backoff after a brief failure. An op the
 * server refuses moves aside to `failed` so the rest keep going. Shows a small badge
 * while anything is waiting or needs attention.
 */
export function OutboxSyncer() {
  const router = useRouter();
  const ops = useOutbox((s) => s.ops.length);
  const failed = useOutbox((s) => s.failed);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, Math.max(0, ms));
    };
    const run = async () => {
      if (running.current || syncPaused() || useOutbox.getState().blocked) return;
      const me = currentAccount();
      if (!me) return;
      running.current = true;
      let sent = 0;
      try {
        while (!syncPaused()) {
          const next = useOutbox.getState().ops[0];
          if (!next) break;
          if (next.notBefore && next.notBefore > Date.now()) {
            schedule(next.notBefore - Date.now());
            return;
          }
          let res: Awaited<ReturnType<typeof applyOpAction>>;
          try {
            res = await applyOpAction(opOf(next), next.owner ?? me);
          } catch (err) {
            const kind = classifyThrown(err);
            if (kind === "stale_build") {
              useOutbox.getState().setBlocked(kind);
              return;
            }
            useOutbox.getState().tried(next.id);
            continue; // the loop waits for notBefore
          }
          if (res.ok) {
            useOutbox.getState().remove(next.id);
            sent++;
          } else if (isRetryable(res.kind)) {
            useOutbox.getState().tried(next.id);
          } else if (needsPerson(res.kind)) {
            useOutbox.getState().setBlocked(res.kind);
            return;
          } else {
            useOutbox.getState().fail(next.id, res.kind, res.error);
          }
        }
      } finally {
        running.current = false;
        if (sent) router.refresh();
      }
    };
    const now = () => {
      useOutbox.setState((s) => ({ ops: s.ops.map((o) => ({ ...o, notBefore: undefined })) }));
      schedule(0);
    };
    const onVisible = () => document.visibilityState === "visible" && now();
    const unsubscribe = useOutbox.subscribe((s, prev) => {
      if (s.ops.length > prev.ops.length) schedule(1000);
    });
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", onVisible);
    // The persisted queue loads from IndexedDB once the account is known; start then.
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
  const first = failed[0];
  return (
    <div
      role="status"
      className="bg-card border-border fixed right-4 bottom-20 z-40 flex max-w-xs items-start gap-2 rounded-xl border p-3 text-sm shadow-lg md:bottom-4"
    >
      {first ? (
        <>
          <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-2">
            <span>
              {failed.length === 1
                ? "An offline change couldn't be saved."
                : `${failed.length} offline changes couldn't be saved.`}{" "}
              {first.kind === "validation" ? `Not saved: ${first.error}` : syncMessage(first.kind)}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-accent inline-flex items-center gap-1 font-medium"
                onClick={() => useOutbox.getState().retryFailed(first.op.id)}
              >
                <RotateCw className="size-3.5" /> Try again
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                onClick={() => useOutbox.getState().removeFailed(first.op.id)}
              >
                <X className="size-3.5" /> Remove it
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <CloudOff className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span>
            {ops} change{ops === 1 ? "" : "s"} waiting to sync
          </span>
        </>
      )}
    </div>
  );
}
