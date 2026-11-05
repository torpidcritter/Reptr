import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { exercises, workoutExercises, workouts, workoutSets } from "@/db/schema";
import type { Database } from "@/db/types";
import { recordPersonalRecords } from "@/modules/analytics/records";
import type { ExerciseSnapshot, SetSnapshot, WorkoutSnapshot } from "./snapshot";

export class WorkoutLockedError extends Error {}

/**
 * Saves the device's copy of a workout. While it's in progress the server copy is
 * replaced wholesale. Once completed or abandoned it's locked: a repeat of the same
 * finish is accepted (a retry), anything else is refused.
 */
export async function saveWorkoutSnapshot(db: Database, userId: string, w: WorkoutSnapshot) {
  const ids = [
    ...new Set(w.exercises.flatMap((e) => [e.exerciseId, e.substitutedFromId ?? e.exerciseId])),
  ];
  if (ids.length) {
    const visible = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          inArray(exercises.id, ids),
          or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        ),
      );
    if (visible.length !== ids.length) throw new Error("Unknown exercise");
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: workouts.userId, status: workouts.status })
      .from(workouts)
      .where(eq(workouts.id, w.id))
      .for("update");

    if (existing && existing.userId !== userId) throw new WorkoutLockedError("Not your workout");
    if (existing && (existing.status === "completed" || existing.status === "abandoned")) {
      if (existing.status === w.status) return { status: existing.status };
      throw new WorkoutLockedError("This workout is already finished");
    }

    const finishing = w.status === "completed" || w.status === "abandoned";
    const finishedAt = finishing ? new Date(w.finishedAt ?? Date.now()) : null;

    // One workout in progress at a time: a newer one from this device wins.
    if (!finishing) {
      await tx
        .update(workouts)
        .set({ status: "abandoned", finishedAt: new Date() })
        .where(
          and(
            eq(workouts.userId, userId),
            ne(workouts.id, w.id),
            inArray(workouts.status, ["active", "paused"]),
          ),
        );
    }

    const row = {
      name: w.name,
      routineId: w.routineId,
      status: w.status,
      startedAt: new Date(w.startedAt),
      finishedAt,
      notes: w.notes,
    };
    await tx
      .insert(workouts)
      .values({ id: w.id, userId, ...row })
      .onConflictDoUpdate({ target: workouts.id, set: row });

    await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, w.id));

    // A finished workout keeps only the sets that were done, and the exercises that have any.
    const kept = w.exercises
      .map((e) => ({ ...e, sets: finishing ? e.sets.filter((s) => s.completedAt) : e.sets }))
      .filter((e) => !finishing || e.sets.length > 0);

    if (kept.length) {
      await tx.insert(workoutExercises).values(
        kept.map((e, i) => ({
          id: e.id,
          userId,
          workoutId: w.id,
          exerciseId: e.exerciseId,
          position: i + 1,
          supersetGroup: e.supersetGroup,
          substitutedFromId: e.substitutedFromId,
          notes: e.notes,
        })),
      );
      const sets = kept.flatMap((e) =>
        e.sets.map((s, i) => ({
          id: s.id,
          userId,
          workoutExerciseId: e.id,
          setNumber: i + 1,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
          distanceMeters: s.distanceMeters,
          rpe: s.rpe,
          rir: s.rir ?? null,
          tempo: s.tempo ?? null,
          notes: s.note ?? null,
          completedAt: s.completedAt ? new Date(s.completedAt) : null,
        })),
      );
      if (sets.length) await tx.insert(workoutSets).values(sets);
    }
    if (w.status === "completed") await recordPersonalRecords(tx, userId, finishedAt!, kept);
    return { status: w.status };
  });
}

/** The workout in progress on the server, if any, as a snapshot (for resuming on another device). */
export async function getActiveWorkout(db: Database, userId: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), inArray(workouts.status, ["active", "paused"])))
    .limit(1);
  return w ? loadSnapshot(db, w) : null;
}

export async function getWorkout(db: Database, userId: string, id: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
  return w ? loadSnapshot(db, w) : null;
}

async function loadSnapshot(
  db: Database,
  w: typeof workouts.$inferSelect,
): Promise<WorkoutSnapshot> {
  const rows = await db
    .select({
      we: workoutExercises,
      name: exercises.name,
      measurement: exercises.measurement,
      set: workoutSets,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(eq(workoutExercises.workoutId, w.id))
    .orderBy(asc(workoutExercises.position), asc(workoutSets.setNumber));

  const byId = new Map<string, ExerciseSnapshot>();
  for (const r of rows) {
    let e = byId.get(r.we.id);
    if (!e) {
      e = {
        id: r.we.id,
        exerciseId: r.we.exerciseId,
        name: r.name,
        measurement: r.measurement,
        supersetGroup: r.we.supersetGroup,
        restSeconds: null,
        substitutedFromId: r.we.substitutedFromId,
        notes: r.we.notes,
        sets: [],
      };
      byId.set(r.we.id, e);
    }
    if (r.set) e.sets.push(toSetSnapshot(r.set));
  }

  return {
    id: w.id,
    name: w.name,
    routineId: w.routineId,
    status: w.status,
    startedAt: w.startedAt.toISOString(),
    finishedAt: w.finishedAt?.toISOString() ?? null,
    notes: w.notes,
    exercises: [...byId.values()],
  };
}

function toSetSnapshot(s: typeof workoutSets.$inferSelect): SetSnapshot {
  return {
    id: s.id,
    type: s.type,
    weightKg: s.weightKg,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
    rpe: s.rpe,
    rir: s.rir,
    tempo: s.tempo,
    note: s.notes,
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

export type PreviousPerformance = Record<string, { date: string; sets: SetSnapshot[] }>;

/** For each exercise, the completed sets from the most recent finished workout that included it. */
export async function getPreviousPerformance(
  db: Database,
  userId: string,
  exerciseIds: string[],
  excludeWorkoutId?: string,
): Promise<PreviousPerformance> {
  if (exerciseIds.length === 0) return {};
  const latest = db
    .selectDistinctOn([workoutExercises.exerciseId], {
      exerciseId: workoutExercises.exerciseId,
      workoutExerciseId: workoutExercises.id,
      finishedAt: workouts.finishedAt,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        inArray(workoutExercises.exerciseId, exerciseIds),
        excludeWorkoutId ? ne(workouts.id, excludeWorkoutId) : sql`true`,
      ),
    )
    .orderBy(workoutExercises.exerciseId, desc(workouts.finishedAt))
    .as("latest");

  const rows = await db
    .select({ exerciseId: latest.exerciseId, finishedAt: latest.finishedAt, set: workoutSets })
    .from(latest)
    .innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, latest.workoutExerciseId))
    .orderBy(asc(workoutSets.setNumber));

  const out: PreviousPerformance = {};
  for (const r of rows) {
    out[r.exerciseId] ??= { date: r.finishedAt!.toISOString(), sets: [] };
    out[r.exerciseId].sets.push(toSetSnapshot(r.set));
  }
  return out;
}
