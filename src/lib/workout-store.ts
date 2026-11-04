"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { SetSnapshot, WorkoutSnapshot } from "@/modules/workouts/snapshot";
import { emptySet } from "@/modules/workouts/snapshot";

// The active workout is kept in IndexedDB on the device, so a refresh, a closed tab
// or a dead connection never loses a set. It syncs to the server in the background.

const hasIdb = () => typeof indexedDB !== "undefined";

const idbStorage: StateStorage = {
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

type State = {
  workout: WorkoutSnapshot | null;
  /** Bumped on every change; the sync loop saves until the server has the latest. */
  revision: number;
  syncedRevision: number;
  sync: SyncState;
  rest: RestTimer;
  hydrated: boolean;
};

type Actions = {
  start: (w: WorkoutSnapshot) => void;
  clear: () => void;
  edit: (fn: (w: WorkoutSnapshot) => void) => void;
  updateSet: (exerciseKey: string, setId: string, patch: Partial<SetSnapshot>) => void;
  addSet: (exerciseKey: string) => void;
  removeSet: (exerciseKey: string, setId: string) => void;
  startRest: (seconds: number) => void;
  adjustRest: (bySeconds: number) => void;
  stopRest: () => void;
  markSynced: (revision: number) => void;
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

      start: (w) => setState((s) => ({ workout: w, revision: s.revision + 1, rest: null })),
      clear: () =>
        setState({ workout: null, rest: null, revision: 0, syncedRevision: 0, sync: "saved" }),

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

      removeSet: (exerciseKey, setId) =>
        getState().edit((w) => {
          const e = w.exercises.find((x) => x.id === exerciseKey);
          if (e) e.sets = e.sets.filter((s) => s.id !== setId);
        }),

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

      markSynced: (revision) =>
        setState((s) => ({
          syncedRevision: Math.max(s.syncedRevision, revision),
          sync: revision >= s.revision ? "saved" : s.sync,
        })),
      setSync: (sync) => setState({ sync }),
    }),
    {
      name: "reptr-active-workout",
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ workout, revision, syncedRevision, rest }) => ({
        workout,
        revision,
        syncedRevision,
        rest,
      }),
      onRehydrateStorage: () => () => useWorkoutStore.setState({ hydrated: true }),
    },
  ),
);
