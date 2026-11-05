import type { ExerciseSnapshot, SetSnapshot, WorkoutSnapshot } from "./snapshot";

// When the same workout is edited on two devices (say a phone and a laptop) and their
// saves cross, neither copy is thrown away: the two are combined. Sets and exercises are
// matched by id, which each device makes, so nothing logged on either side is lost.

const time = (s: SetSnapshot) => (s.completedAt ? Date.parse(s.completedAt) : 0);

/** For a set on both sides: a completed set beats an open one, and the later finish wins. */
function pickSet(theirs: SetSnapshot, mine: SetSnapshot) {
  if (!mine.completedAt && theirs.completedAt) return theirs;
  if (mine.completedAt && theirs.completedAt && time(theirs) > time(mine)) return theirs;
  return mine;
}

/** Keeps `mine`'s order and adds what only `theirs` has after it, in its own order. */
function union<T extends { id: string }>(theirs: T[], mine: T[], pick: (a: T, b: T) => T) {
  const theirsById = new Map(theirs.map((t) => [t.id, t]));
  const mineIds = new Set(mine.map((m) => m.id));
  return [
    ...mine.map((m) => (theirsById.has(m.id) ? pick(theirsById.get(m.id)!, m) : m)),
    ...theirs.filter((t) => !mineIds.has(t.id)),
  ];
}

function pickExercise(theirs: ExerciseSnapshot, mine: ExerciseSnapshot): ExerciseSnapshot {
  return { ...mine, sets: union(theirs.sets, mine.sets, pickSet).slice(0, 50) };
}

/**
 * Combines the server's copy (`theirs`) with this device's (`mine`). This device's
 * name, notes and status are kept, as it's the one saving now. A set deleted on one
 * device but still on the other comes back, which is safer than losing a logged set.
 */
export function mergeWorkouts(theirs: WorkoutSnapshot, mine: WorkoutSnapshot): WorkoutSnapshot {
  return {
    ...mine,
    notes: mine.notes ?? theirs.notes,
    exercises: union(theirs.exercises, mine.exercises, pickExercise).slice(0, 40),
  };
}
