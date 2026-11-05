import { e1rm, isWorkingSet, setVolume } from "@/modules/analytics/calc";
import type { ExerciseSnapshot, WorkoutSnapshot } from "@/modules/workouts/snapshot";

export type ExerciseSummary = {
  sets: number;
  volumeKg: number;
  bestE1rm: number | null;
  /** The heaviest working set, as weight × reps. */
  topSet: { weightKg: number | null; reps: number | null } | null;
};

function summarizeExercise(e: ExerciseSnapshot): ExerciseSummary {
  const work = e.sets.filter((s) => s.completedAt && isWorkingSet(s));
  const top = [...work].sort(
    (a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
  )[0];
  const e1rms = work.map((s) => e1rm(s.weightKg, s.reps)).filter((x): x is number => x != null);
  return {
    sets: work.length,
    volumeKg: e.measurement === "weight_reps" ? work.reduce((n, s) => n + setVolume(s), 0) : 0,
    bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
    topSet: top ? { weightKg: top.weightKg, reps: top.reps } : null,
  };
}

/**
 * Lines up two workouts exercise by exercise (matched by exercise, in the order of the
 * newer one, then anything only the older one had).
 */
export function compareWorkouts(older: WorkoutSnapshot, newer: WorkoutSnapshot) {
  const byExercise = (w: WorkoutSnapshot) => {
    const m = new Map<string, { name: string; summary: ExerciseSummary }>();
    for (const e of w.exercises) {
      if (!m.has(e.exerciseId))
        m.set(e.exerciseId, { name: e.name, summary: summarizeExercise(e) });
    }
    return m;
  };
  const a = byExercise(older);
  const b = byExercise(newer);
  const ids = [...b.keys(), ...[...a.keys()].filter((id) => !b.has(id))];
  const rows = ids.map((id) => ({
    exerciseId: id,
    name: (b.get(id) ?? a.get(id))!.name,
    before: a.get(id)?.summary ?? null,
    after: b.get(id)?.summary ?? null,
  }));
  const total = (m: typeof a) =>
    [...m.values()].reduce(
      (t, x) => ({ sets: t.sets + x.summary.sets, volumeKg: t.volumeKg + x.summary.volumeKg }),
      { sets: 0, volumeKg: 0 },
    );
  return { rows, before: total(a), after: total(b) };
}
