import { z } from "zod";

// A workout in progress lives on the device as one snapshot. Every change saves the
// whole snapshot to the server, which replaces its copy. Ids are made on the device,
// so a retried save is harmless.

const num = (min: number, max: number) => z.number().min(min).max(max).nullable();

export const setSnapshotSchema = z.object({
  id: z.uuid(),
  type: z.enum(["warmup", "working", "drop", "failure"]),
  weightKg: num(0, 1000),
  reps: z.number().int().min(0).max(1000).nullable(),
  durationSeconds: z.number().int().min(0).max(86400).nullable(),
  distanceMeters: num(0, 1_000_000),
  rpe: num(1, 10),
  completedAt: z.iso.datetime().nullable(),
});

export const exerciseSnapshotSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  name: z.string(),
  measurement: z.enum(["weight_reps", "reps", "assisted_reps", "time", "distance_time"]),
  supersetGroup: z.number().int().min(1).max(50).nullable(),
  restSeconds: z.number().int().min(0).max(1800).nullable(),
  substitutedFromId: z.uuid().nullable(),
  notes: z.string().max(1000).nullable(),
  sets: z.array(setSnapshotSchema).max(50),
});

export const workoutSnapshotSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  routineId: z.uuid().nullable(),
  status: z.enum(["active", "paused", "completed", "abandoned"]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  notes: z.string().max(2000).nullable(),
  exercises: z.array(exerciseSnapshotSchema).max(40),
});

export type SetSnapshot = z.infer<typeof setSnapshotSchema>;
export type ExerciseSnapshot = z.infer<typeof exerciseSnapshotSchema>;
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>;
export type Measurement = ExerciseSnapshot["measurement"];

/** Which inputs a set shows for an exercise. */
export const fieldsFor = (m: Measurement) => ({
  weight: m === "weight_reps" || m === "assisted_reps",
  reps: m === "weight_reps" || m === "reps" || m === "assisted_reps",
  duration: m === "time" || m === "distance_time",
  distance: m === "distance_time",
});

/** A set counts as filled in when every field its exercise needs has a value. */
export function isSetFilled(set: SetSnapshot, m: Measurement) {
  const f = fieldsFor(m);
  return (
    (!f.weight || set.weightKg != null || m === "assisted_reps") &&
    (!f.reps || set.reps != null) &&
    (!f.duration || set.durationSeconds != null) &&
    (!f.distance || set.distanceMeters != null)
  );
}

export function emptySet(id: string, from?: Partial<SetSnapshot>): SetSnapshot {
  return {
    id,
    type: from?.type ?? "working",
    weightKg: from?.weightKg ?? null,
    reps: from?.reps ?? null,
    durationSeconds: from?.durationSeconds ?? null,
    distanceMeters: from?.distanceMeters ?? null,
    rpe: null,
    completedAt: null,
  };
}

/** Totals for the summary: completed sets and volume (weight × reps, weighted exercises only). */
export function summarize(w: WorkoutSnapshot) {
  let sets = 0;
  let volumeKg = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (!s.completedAt) continue;
      sets += 1;
      if (e.measurement === "weight_reps" && s.type !== "warmup") {
        volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
    }
  }
  return {
    sets,
    volumeKg,
    exercises: w.exercises.filter((e) => e.sets.some((s) => s.completedAt)).length,
  };
}
