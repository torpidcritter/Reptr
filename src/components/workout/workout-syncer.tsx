"use client";

import { useEffect, useRef } from "react";
import { saveWorkoutAction } from "@/app/(app)/workout/actions";
import { deviceId, useWorkoutStore } from "@/lib/workout-store";

const RETRY_MS = [2000, 5000, 10000, 30000];

/**
 * Saves the active workout to the server whenever it changes. Runs on every app page so
 * a set logged just before navigating away still syncs. Retries with backoff when
 * offline, and immediately when the connection or the tab comes back.
 */
export function WorkoutSyncer() {
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const run = async () => {
      const { workout, revision, syncedRevision, hydrated, serverVersion } =
        useWorkoutStore.getState();
      if (!hydrated || !workout || inFlight.current || revision <= syncedRevision) return;

      inFlight.current = true;
      useWorkoutStore.getState().setSync("saving");
      try {
        const res = await saveWorkoutAction(workout, {
          deviceId: deviceId(),
          baseVersion: serverVersion,
        });
        const locked = !res.ok && res.locked === true;
        if (res.ok || locked) {
          attempt.current = 0;
          if (res.ok && res.merged) {
            useWorkoutStore.getState().adoptMerged(res.merged, res.version);
            return;
          }
          useWorkoutStore.getState().markSynced(revision, res.ok ? res.version : undefined);
          const latest = useWorkoutStore.getState();
          const finished = workout.status === "completed" || workout.status === "abandoned";
          if (
            (finished || locked) &&
            latest.workout?.id === workout.id &&
            latest.revision === revision
          ) {
            latest.clear();
          }
        } else {
          useWorkoutStore.getState().setSync("error");
          console.error("Workout not saved:", res.error);
        }
      } catch {
        useWorkoutStore.getState().setSync("offline");
        const wait = RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)];
        schedule(wait);
      } finally {
        inFlight.current = false;
      }
      const s = useWorkoutStore.getState();
      if (s.revision > s.syncedRevision && attempt.current === 0) schedule(300);
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
    const onVisible = () => document.visibilityState === "visible" && now();
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", onVisible);
    schedule(0);

    return () => {
      unsubscribe();
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return null;
}
