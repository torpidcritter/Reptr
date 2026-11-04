import {
  emptySet,
  type ExerciseSnapshot,
  type Measurement,
  type WorkoutSnapshot,
} from "./snapshot";
import type { PreviousPerformance } from "./workouts";

type RoutineLike = {
  id: string;
  name: string;
  items: {
    exerciseId: string;
    exerciseName: string;
    measurement: Measurement;
    targetSets: number | null;
    restSeconds: number | null;
    supersetGroup: number | null;
  }[];
};

const newId = () => crypto.randomUUID();

/** Sets for an exercise, prefilled from last time so a repeat set is one tap. */
export function plannedSets(count: number, previous?: PreviousPerformance[string]) {
  const prev = previous?.sets.filter((s) => s.type !== "warmup") ?? [];
  const n = Math.max(count, 1);
  return Array.from({ length: n }, (_, i) => {
    const from = prev[i] ?? prev[prev.length - 1];
    return emptySet(newId(), from && { ...from, type: "working" });
  });
}

export function exerciseFor(
  e: { exerciseId: string; name: string; measurement: Measurement },
  opts: {
    sets?: number;
    restSeconds?: number | null;
    supersetGroup?: number | null;
    previous?: PreviousPerformance[string];
  } = {},
): ExerciseSnapshot {
  return {
    id: newId(),
    exerciseId: e.exerciseId,
    name: e.name,
    measurement: e.measurement,
    supersetGroup: opts.supersetGroup ?? null,
    restSeconds: opts.restSeconds ?? null,
    substitutedFromId: null,
    notes: null,
    sets: plannedSets(opts.sets ?? 3, opts.previous),
  };
}

export function workoutFromRoutine(
  routine: RoutineLike,
  previous: PreviousPerformance,
  now = new Date(),
): WorkoutSnapshot {
  return {
    id: newId(),
    name: routine.name,
    routineId: routine.id,
    status: "active",
    startedAt: now.toISOString(),
    finishedAt: null,
    notes: null,
    exercises: routine.items.map((item) =>
      exerciseFor(
        { exerciseId: item.exerciseId, name: item.exerciseName, measurement: item.measurement },
        {
          sets: item.targetSets ?? 3,
          restSeconds: item.restSeconds,
          supersetGroup: item.supersetGroup,
          previous: previous[item.exerciseId],
        },
      ),
    ),
  };
}

export function emptyWorkout(now = new Date()): WorkoutSnapshot {
  const hour = now.getHours();
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return {
    id: newId(),
    name: `${part} workout`,
    routineId: null,
    status: "active",
    startedAt: now.toISOString(),
    finishedAt: null,
    notes: null,
    exercises: [],
  };
}

/** A new workout with the same exercises and set counts as a past one, prefilled with its numbers. */
export function workoutFromPast(past: WorkoutSnapshot, now = new Date()): WorkoutSnapshot {
  return {
    ...emptyWorkout(now),
    name: past.name,
    routineId: past.routineId,
    exercises: past.exercises.map((e) =>
      exerciseFor(e, {
        sets: e.sets.filter((s) => s.type !== "warmup").length || 1,
        restSeconds: e.restSeconds,
        supersetGroup: e.supersetGroup,
        previous: { date: past.startedAt, sets: e.sets },
      }),
    ),
  };
}
