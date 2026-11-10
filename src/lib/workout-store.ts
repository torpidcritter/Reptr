"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SetSnapshot, WorkoutSnapshot } from "@/modules/workouts/snapshot";
import { mergeWorkouts } from "@/modules/workouts/merge";
import { emptySet } from "@/modules/workouts/snapshot";
import type { SyncErrorKind } from "@/modules/sync/errors";
import type { SyncConflict } from "@/modules/sync/conflict";
import { accountStorage, registerAccountStore } from "./device/scope";

// The active workout is kept in IndexedDB on the device, under the signed-in account,
// so a refresh, a closed tab or a dead connection never loses a set. It syncs to the
// server in the background. It is only ever cleared once the server has every set, or
// when the person explicitly discards it.

export type RestTimer = { endsAt: number; duration: number } | null;
/**
 * saved/saving/offline as you'd expect; error: the last save was refused and will be
 * retried when something changes; conflict: the server can't take this copy and the
 * person has to choose what happens to it; paused: waiting for a reload or sign-in.
 */
export type SyncState = "saved" | "saving" | "offline" | "error" | "conflict" | "paused";
export type RemovedSet = { exerciseKey: string; set: SetSnapshot; index: number; at: number };

type State = {
  workout: WorkoutSnapshot | null;
  /** Bumped on every change; the sync loop saves until the server has the latest. */
  revision: number;
  syncedRevision: number;
  sync: SyncState;
  rest: RestTimer;
  hydrated: boolean;
  /** The last deleted set, kept briefly so it can be undone. Not persisted. */
  lastRemoved: RemovedSet | null;
  /** The server's version of this workout when this device last saved or loaded it. */
  serverVersion: number | null;
  /** Set when this device's copy was combined with edits from another device. Not persisted. */
  mergedAt: number | null;
  /** Why the server couldn't take this copy. Kept until the person resolves it. */
  conflict: SyncConflict | null;
  /** The last failed save, to explain the badge. Not persisted. */
  lastError: { kind: SyncErrorKind; message: string } | null;
  /**
   * Set when the person chose to finish the workout running on another device and carry
   * on with this one. Sent with the next save, then cleared.
   */
  takeOver: boolean;
};

type Actions = {
  start: (w: WorkoutSnapshot, serverVersion?: number | null) => void;
  clear: () => void;
  edit: (fn: (w: WorkoutSnapshot) => void) => void;
  updateSet: (exerciseKey: string, setId: string, patch: Partial<SetSnapshot>) => void;
  addSet: (exerciseKey: string) => void;
  removeSet: (exerciseKey: string, setId: string) => void;
  undoRemove: () => void;
  /** Logs another set like the last one in a single tap. Returns false if there's nothing to copy. */
  repeatLastSet: (exerciseKey: string) => boolean;
  startRest: (seconds: number) => void;
  adjustRest: (bySeconds: number) => void;
  stopRest: () => void;
  markSynced: (revision: number, serverVersion?: number) => void;
  /** Takes the server's combined copy, keeping any edits made here since it was sent. */
  adoptMerged: (merged: WorkoutSnapshot, serverVersion: number) => void;
  setSync: (s: SyncState) => void;
  setConflict: (c: SyncConflict | null) => void;
  setError: (e: State["lastError"]) => void;
  /** Resolves an "in progress on another device" conflict in favour of this device. */
  takeOverHere: () => void;
  /** Resolves a "finished on another device" conflict: the unsynced sets become their own workout. */
  replaceWith: (w: WorkoutSnapshot) => void;
};

const empty: Omit<State, "hydrated"> = {
  workout: null,
  rest: null,
  revision: 0,
  syncedRevision: 0,
  sync: "saved",
  serverVersion: null,
  mergedAt: null,
  conflict: null,
  lastError: null,
  lastRemoved: null,
  takeOver: false,
};

const clone = <T>(v: T): T => structuredClone(v);

type Persisted = Pick<
  State,
  "workout" | "revision" | "syncedRevision" | "rest" | "serverVersion" | "conflict" | "takeOver"
>;

export const useWorkoutStore = create<State & Actions>()(
  persist<State & Actions, [], [], Persisted>(
    (setState, getState) => ({
      ...empty,
      hydrated: false,

      start: (w, serverVersion = null) =>
        setState((s) => ({
          workout: w,
          revision: s.revision + 1,
          rest: null,
          serverVersion,
          conflict: null,
          lastError: null,
          takeOver: false,
        })),
      clear: () => setState({ ...empty }),

      edit: (fn) => {
        const w = getState().workout;
        if (!w) return;
        const next = clone(w);
        fn(next);
        setState((s) => ({ workout: next, revision: s.revision + 1 }));
      },

      updateSet: (exerciseKey, setId, patch) =>
        getState().edit((w) => {
          const set = w.exercises
            .find((e) => e.id === exerciseKey)
            ?.sets.find((s) => s.id === setId);
          if (set) Object.assign(set, patch);
        }),

      addSet: (exerciseKey) =>
        getState().edit((w) => {
          const e = w.exercises.find((x) => x.id === exerciseKey);
          if (!e) return;
          const last = e.sets[e.sets.length - 1];
          e.sets.push(
            emptySet(
              crypto.randomUUID(),
              last && { ...last, type: last.type === "warmup" ? "working" : last.type },
            ),
          );
        }),

      removeSet: (exerciseKey, setId) => {
        const e = getState().workout?.exercises.find((x) => x.id === exerciseKey);
        const index = e?.sets.findIndex((s) => s.id === setId) ?? -1;
        if (!e || index < 0) return;
        const set = e.sets[index];
        getState().edit((w) => {
          const x = w.exercises.find((y) => y.id === exerciseKey)!;
          x.sets = x.sets.filter((s) => s.id !== setId);
        });
        setState({ lastRemoved: { exerciseKey, set: clone(set), index, at: Date.now() } });
      },

      undoRemove: () => {
        const r = getState().lastRemoved;
        if (!r) return;
        setState({ lastRemoved: null });
        getState().edit((w) => {
          const e = w.exercises.find((x) => x.id === r.exerciseKey);
          if (e && !e.sets.some((s) => s.id === r.set.id)) {
            e.sets.splice(Math.min(r.index, e.sets.length), 0, r.set);
          }
        });
      },

      repeatLastSet: (exerciseKey) => {
        const e = getState().workout?.exercises.find((x) => x.id === exerciseKey);
        const done = e?.sets.filter((s) => s.completedAt);
        const last = done?.[done.length - 1];
        if (!e || !last) return false;
        getState().edit((w) => {
          const x = w.exercises.find((y) => y.id === exerciseKey)!;
          const copy = {
            ...emptySet(crypto.randomUUID(), last),
            type: last.type === "warmup" ? ("working" as const) : last.type,
            completedAt: new Date().toISOString(),
          };
          // Use up the next planned set if there is one, otherwise add a set.
          const open = x.sets.findIndex((s) => !s.completedAt);
          if (open >= 0) x.sets[open] = { ...copy, id: x.sets[open].id };
          else x.sets.push(copy);
        });
        return true;
      },

      startRest: (seconds) =>
        setState({
          rest: seconds > 0 ? { endsAt: Date.now() + seconds * 1000, duration: seconds } : null,
        }),
      adjustRest: (by) =>
        setState((s) =>
          s.rest
            ? {
                rest: {
                  endsAt: Math.max(Date.now(), s.rest.endsAt + by * 1000),
                  duration: Math.max(0, s.rest.duration + by),
                },
              }
            : {},
        ),
      stopRest: () => setState({ rest: null }),

      markSynced: (revision, serverVersion) =>
        setState((s) => ({
          takeOver: false,
          syncedRevision: Math.max(s.syncedRevision, revision),
          sync: revision >= s.revision ? "saved" : s.sync,
          serverVersion: serverVersion ?? s.serverVersion,
        })),
      adoptMerged: (merged, serverVersion) => {
        // The "combined" note shows for a few seconds.
        setTimeout(() => setState({ mergedAt: null }), 8000);
        setState((s) => ({
          // Edits made while the save was on its way are folded in, then saved again.
          workout:
            s.workout && s.workout.id === merged.id ? mergeWorkouts(merged, s.workout) : merged,
          revision: s.revision + 1,
          serverVersion,
          mergedAt: Date.now(),
        }));
      },
      setSync: (sync) => setState({ sync }),
      setConflict: (conflict) =>
        setState({ conflict, sync: conflict ? "conflict" : getState().sync }),
      setError: (lastError) => setState({ lastError }),
      takeOverHere: () =>
        setState((s) => ({
          takeOver: true,
          conflict: null,
          lastError: null,
          sync: "saving",
          revision: s.revision + 1,
        })),
      replaceWith: (w) =>
        setState((s) => ({
          workout: w,
          conflict: null,
          lastError: null,
          takeOver: false,
          serverVersion: null,
          sync: "saving",
          revision: s.revision + 1,
        })),
    }),
    {
      name: "reptr-active-workout",
      storage: createJSONStorage(() => accountStorage),
      // Loaded once the signed-in account is known (see device/scope.ts).
      skipHydration: true,
      partialize: ({
        workout,
        revision,
        syncedRevision,
        rest,
        serverVersion,
        conflict,
        takeOver,
      }) => ({ workout, revision, syncedRevision, rest, serverVersion, conflict, takeOver }),
      onRehydrateStorage: () => (state) =>
        useWorkoutStore.setState({
          hydrated: true,
          ...(state?.conflict ? { sync: "conflict" as const } : {}),
        }),
    },
  ),
);

registerAccountStore(useWorkoutStore, () =>
  useWorkoutStore.setState({ ...empty, hydrated: false }),
);

/** True while this device holds changes the server hasn't confirmed. */
export function hasUnsyncedWorkout() {
  const s = useWorkoutStore.getState();
  return Boolean(s.workout && (s.revision > s.syncedRevision || s.conflict));
}

/** A random id this device keeps, so the server can tell two devices' saves apart. */
export function deviceId() {
  const key = "reptr-device-id";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return (sessionId ??= crypto.randomUUID());
  }
}
let sessionId: string | undefined;
