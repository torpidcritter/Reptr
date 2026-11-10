"use client";

import { useEffect, useRef } from "react";
import { saveWorkoutAction } from "@/app/(app)/workout/actions";
import { syncPaused } from "@/lib/device/session";
import { isLeader, useTabRole } from "@/lib/device/tabs";
import { deviceId, useWorkoutStore } from "@/lib/workout-store";
import { backoffMs, classifyThrown, isRetryable, syncMessage } from "@/modules/sync/errors";

/**
 * Saves the active workout to the server whenever it changes. Runs on every app page so
 * a set logged just before navigating away still syncs.
 *
 * The device copy is only cleared once the server has every set in it. When the server
 * can't take it (finished or replaced on another device, another account), the copy is
 * kept and marked as a conflict for the person to resolve. Brief failures retry with
 * backoff; refused data waits for the next change; an outdated app waits for a reload.
 */
export function WorkoutSyncer() {
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const store = () => useWorkoutStore.getState();

    const run = async () => {
      const {
        workout,
        revision,
        syncedRevision,
        hydrated,
        serverVersion,
        conflict,
        sync,
        takeOver,
      } = store();
      if (!hydrated || !workout || inFlight.current || syncPaused() || !isLeader()) return;
      if (conflict || sync === "paused" || revision <= syncedRevision) return;

      inFlight.current = true;
      store().setSync("saving");
      try {
        const res = await saveWorkoutAction(workout, {
          deviceId: deviceId(),
          baseVersion: serverVersion,
          takeOver: takeOver || undefined,
        });
        if (res.ok) {
          attempt.current = 0;
          store().setError(null);
          if (res.merged) {
            store().adoptMerged(res.merged, res.version);
            return;
          }
          store().markSynced(revision, res.version);
          const latest = store();
          const finished =
            res.alreadyFinished || workout.status === "completed" || workout.status === "abandoned";
          // Only now, with every set confirmed on the server, is the device copy let go.
          if (finished && latest.workout?.id === workout.id && latest.revision === revision) {
            latest.clear();
          }
          return;
        }
        if (res.kind === "conflict") {
          attempt.current = 0;
          store().setConflict(res.conflict);
          store().setError({ kind: res.kind, message: res.error });
          return;
        }
        store().setError({ kind: res.kind, message: syncMessage(res.kind, res.error) });
        if (isRetryable(res.kind)) {
          store().setSync(res.kind === "rate_limited" ? "error" : "offline");
          schedule(backoffMs(attempt.current++));
        } else {
          // Refused as it is: tried again after the next change, and on reconnect.
          store().setSync("error");
        }
      } catch (err) {
        const kind = classifyThrown(err);
        store().setError({ kind, message: syncMessage(kind) });
        if (kind === "stale_build") {
          store().setSync("paused");
          return;
        }
        store().setSync("offline");
        schedule(backoffMs(attempt.current++));
      } finally {
        inFlight.current = false;
      }
      const s = store();
      if (s.revision > s.syncedRevision && attempt.current === 0 && !s.conflict) schedule(300);
    };

    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, ms);
    };

    const unsubscribe = useWorkoutStore.subscribe((s, prev) => {
      if (s.revision !== prev.revision || (s.hydrated && !prev.hydrated)) schedule(500);
    });
    const now = () => {
      attempt.current = 0;
      schedule(0);
    };
    const unlead = useTabRole.subscribe((s, prev) => s.leader && !prev.leader && now());
    const onVisible = () => document.visibilityState === "visible" && now();
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", onVisible);
    schedule(0);

    return () => {
      unsubscribe();
      unlead();
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return null;
}
