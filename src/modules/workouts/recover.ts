import type { WorkoutSnapshot } from "./snapshot";

/**
 * Builds a separate, finished workout from sets the server never got, after the original
 * workout was finished on another device. It gets a new workout id and new exercise ids
 * (those exist on the server already); the sets keep their ids, which the server has
 * never seen, so saving it again after a dropped connection can't duplicate anything.
 */
export function recoverAsNewWorkout(
  w: WorkoutSnapshot,
  setIds: string[],
  newId: () => string,
): WorkoutSnapshot | null {
  const wanted = new Set(setIds);
  const exercises = w.exercises
    .map((e) => ({ ...e, id: newId(), sets: e.sets.filter((s) => wanted.has(s.id)) }))
    .filter((e) => e.sets.length > 0);
  if (!exercises.length) return null;
  const times = exercises
    .flatMap((e) => e.sets.map((s) => s.completedAt))
    .filter((t): t is string => Boolean(t))
    .sort();
  return {
    ...w,
    id: newId(),
    name: `${w.name} (this device)`.slice(0, 80),
    status: "completed",
    startedAt: times[0] && times[0] < w.startedAt ? times[0] : w.startedAt,
    finishedAt: times.at(-1) ?? new Date().toISOString(),
    exercises,
  };
}

/** How many sets in a copy have been done, for "N sets will be lost" warnings. */
export const completedSetCount = (w: WorkoutSnapshot | null) =>
  w ? w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completedAt).length, 0) : 0;
