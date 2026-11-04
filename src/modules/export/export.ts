import { asc, eq } from "drizzle-orm";
import {
  bodyMetrics,
  exercises,
  personalRecords,
  profiles,
  progressPhotos,
  routineExercises,
  routines,
  workoutExercises,
  workouts,
  workoutSets,
} from "@/db/schema";
import type { Database } from "@/db/types";

/** One row per logged set, with the workout and exercise it belongs to. */
export async function setRows(db: Database, userId: string) {
  return db
    .select({
      date: workouts.startedAt,
      workout: workouts.name,
      status: workouts.status,
      exercise: exercises.name,
      setNumber: workoutSets.setNumber,
      setType: workoutSets.type,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceMeters: workoutSets.distanceMeters,
      rpe: workoutSets.rpe,
      completedAt: workoutSets.completedAt,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutSets.userId, userId))
    .orderBy(asc(workouts.startedAt), asc(workoutExercises.position), asc(workoutSets.setNumber));
}

/** Everything the user has stored, as plain JSON (photos as metadata only). */
export async function exportAll(db: Database, userId: string) {
  const mine = <T extends { userId: unknown }>(t: T) => eq(t.userId as never, userId);
  const [profile, ws, wes, sets, rs, res, metrics, records, photos, custom] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)),
    db.select().from(workouts).where(mine(workouts)).orderBy(asc(workouts.startedAt)),
    db.select().from(workoutExercises).where(mine(workoutExercises)),
    db.select().from(workoutSets).where(mine(workoutSets)),
    db.select().from(routines).where(mine(routines)),
    db.select().from(routineExercises).where(mine(routineExercises)),
    db.select().from(bodyMetrics).where(mine(bodyMetrics)).orderBy(asc(bodyMetrics.recordedAt)),
    db.select().from(personalRecords).where(mine(personalRecords)),
    db.select().from(progressPhotos).where(mine(progressPhotos)),
    db.select().from(exercises).where(eq(exercises.ownerId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: "reptr-export-v1",
    profile: profile[0] ?? null,
    customExercises: custom,
    routines: rs.map((r) => ({ ...r, exercises: res.filter((x) => x.routineId === r.id) })),
    workouts: ws.map((w) => ({
      ...w,
      exercises: wes
        .filter((e) => e.workoutId === w.id)
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          ...e,
          sets: sets
            .filter((s) => s.workoutExerciseId === e.id)
            .sort((a, b) => a.setNumber - b.setNumber),
        })),
    })),
    bodyMetrics: metrics,
    personalRecords: records,
    progressPhotos: photos,
  };
}

/** RFC 4180 CSV. */
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return (
    [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") +
    "\r\n"
  );
}
