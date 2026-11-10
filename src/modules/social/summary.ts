import { isWorkingSet, setVolume, type RecordType } from "@/modules/analytics/calc";
import type { WorkoutSnapshot } from "@/modules/workouts/snapshot";

/**
 * What a shared workout shows. Built on the server from the saved workout, so a device
 * can't post numbers it didn't log. Weights are in kg; the reader's units are applied
 * when it's shown. No body measurements, notes or RPE are included.
 */
export type WorkoutSummary = {
  v: 1;
  name: string;
  finishedAt: string;
  durationSeconds: number;
  exercises: {
    name: string;
    sets: number;
    /** Heaviest working set, for weighted exercises. */
    best: { weightKg: number; reps: number } | null;
  }[];
  workingSets: number;
  volumeKg: number;
  records: { exercise: string; type: RecordType }[];
};

export function buildSummary(
  w: WorkoutSnapshot,
  recordsBySet: Record<string, RecordType[]>,
): WorkoutSummary {
  const exercises = w.exercises.map((e) => {
    const working = e.sets.filter(isWorkingSet);
    let best: WorkoutSummary["exercises"][number]["best"] = null;
    for (const s of working) {
      if (s.weightKg == null || s.reps == null || s.reps < 1) continue;
      if (
        !best ||
        s.weightKg > best.weightKg ||
        (s.weightKg === best.weightKg && s.reps > best.reps)
      )
        best = { weightKg: s.weightKg, reps: s.reps };
    }
    return {
      name: e.name,
      sets: working.length,
      best: e.measurement === "weight_reps" ? best : null,
    };
  });
  const records = w.exercises.flatMap((e) =>
    e.sets.flatMap((s) => (recordsBySet[s.id] ?? []).map((type) => ({ exercise: e.name, type }))),
  );
  const finished = w.finishedAt ? Date.parse(w.finishedAt) : Date.parse(w.startedAt);
  return {
    v: 1,
    name: w.name,
    finishedAt: new Date(finished).toISOString(),
    durationSeconds: Math.max(0, Math.round((finished - Date.parse(w.startedAt)) / 1000)),
    exercises,
    workingSets: exercises.reduce((n, e) => n + e.sets, 0),
    volumeKg: Math.round(
      w.exercises
        .filter((e) => e.measurement === "weight_reps")
        .flatMap((e) => e.sets.filter(isWorkingSet))
        .reduce((sum, s) => sum + setVolume(s), 0),
    ),
    // One line per exercise and type, best kept, so a record set twice isn't listed twice.
    records: [...new Map(records.map((r) => [`${r.exercise}|${r.type}`, r])).values()],
  };
}
