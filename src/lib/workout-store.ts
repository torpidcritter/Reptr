"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { SetSnapshot, WorkoutSnapshot } from "@/modules/workouts/snapshot";
import { mergeWorkouts } from "@/modules/workouts/merge";
import { emptySet } from "@/modules/workouts/snapshot";

// The active workout is kept in IndexedDB on the device, so a refresh, a closed tab
// or a dead connection never loses a set. It syncs to the server in the background.

const hasIdb = () => typeof indexedDB !== "undefined";

export const idbStorage: StateStorage = {
  getItem: async (name) => (hasIdb() ? ((await get<string>(name)) ?? null) : null),
  setItem: async (name, value) => {
    if (hasIdb()) await set(name, value);
  },
  removeItem: async (name) => {
    if (hasIdb()) await del(name);
  },
};

export type RestTimer = { endsAt: number; duration: number } | null;
export type SyncState = "saved" | "saving" | "offline" | "error";
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
};

const clone = <T>(v: T): T => structuredClone(v);

export const useWorkoutStore = create<State & Actions>()(
  persist(
    (setState, getState) => ({
      workout: null,
      revision: 0,
      syncedRevision: 0,
      sync: "saved",
      rest: null,
      hydrated: false,
      lastRemoved: null,
      serverVersion: null,
      mergedAt: null,

      start: (w, serverVersion = null) =>
        setState((s) => ({ workout: w, revision: s.revision + 1, rest: null, serverVersion })),
      clear: () =>
        setState({
          workout: null,
          rest: null,
          revision: 0,
          syncedRevision: 0,
          sync: "saved",
          serverVersion: null,
          mergedAt: null,
        }),

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
    }),
    {
      name: "reptr-active-workout",
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ workout, revision, syncedRevision, rest, serverVersion }) => ({
        workout,
        revision,
        syncedRevision,
        rest,
        serverVersion,
      }),
      onRehydrateStorage: () => () => useWorkoutStore.setState({ hydrated: true }),
    },
  ),
);

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
