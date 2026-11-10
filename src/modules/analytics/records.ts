import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { exercises, personalRecords, workoutExercises, workouts, workoutSets } from "@/db/schema";
import type { Database } from "@/db/types";
import { type CalcSet, findRecords, type RecordType } from "./calc";
import type { Session } from "./progression";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

type FinishedExercise = {
  exerciseId: string;
  measurement: string;
  sets: (CalcSet & { id: string; completedAt: string | null })[];
};

/** Best value so far per exercise and record type. */
async function currentBests(db: Database | Tx, userId: string, exerciseIds: string[]) {
  if (!exerciseIds.length) return new Map<string, Partial<Record<RecordType, number>>>();
  const rows = await db
    .select({
      exerciseId: personalRecords.exerciseId,
      type: personalRecords.type,
      value: sql<number>`max(${personalRecords.value})`.mapWith(Number),
    })
    .from(personalRecords)
    .where(
      and(eq(personalRecords.userId, userId), inArray(personalRecords.exerciseId, exerciseIds)),
    )
    .groupBy(personalRecords.exerciseId, personalRecords.type);
  const out = new Map<string, Partial<Record<RecordType, number>>>();
  for (const r of rows) {
    const m = out.get(r.exerciseId) ?? {};
    m[r.type] = r.value;
    out.set(r.exerciseId, m);
  }
  return out;
}

async function measurements(db: Database | Tx, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: exercises.id, measurement: exercises.measurement })
    .from(exercises)
    .where(inArray(exercises.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.measurement as string]));
}

/**
 * Recomputes every personal record for some exercises from the completed workouts, in
 * the order they were finished, exactly as if each finish had been recorded in turn.
 * Used after a finished workout is corrected or deleted, so no record outlives the set
 * that earned it.
 */
export async function rebuildPersonalRecords(tx: Tx, userId: string, exerciseIds: string[]) {
  const ids = [...new Set(exerciseIds)];
  if (!ids.length) return 0;
  await tx
    .delete(personalRecords)
    .where(and(eq(personalRecords.userId, userId), inArray(personalRecords.exerciseId, ids)));
  const rows = await tx
    .select({
      workoutId: workouts.id,
      finishedAt: workouts.finishedAt,
      exerciseId: workoutExercises.exerciseId,
      set: workoutSets,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        inArray(workoutExercises.exerciseId, ids),
      ),
    )
    .orderBy(asc(workouts.finishedAt), asc(workouts.id), asc(workoutSets.setNumber));

  // Group into finished workouts, oldest first, and replay them.
  const sessions: { finishedAt: Date; exercises: Map<string, FinishedExercise["sets"]> }[] = [];
  let current: (typeof sessions)[number] | null = null;
  let currentId: string | null = null;
  for (const r of rows) {
    if (r.workoutId !== currentId) {
      currentId = r.workoutId;
      current = { finishedAt: r.finishedAt!, exercises: new Map() };
      sessions.push(current);
    }
    const sets = current!.exercises.get(r.exerciseId) ?? [];
    sets.push({
      id: r.set.id,
      type: r.set.type,
      weightKg: r.set.weightKg,
      reps: r.set.reps,
      durationSeconds: r.set.durationSeconds,
      distanceMeters: r.set.distanceMeters,
      completedAt: r.set.completedAt?.toISOString() ?? null,
    });
    current!.exercises.set(r.exerciseId, sets);
  }
  // Same rules as recordPersonalRecords, with the running bests kept in memory.
  const measured = await measurements(tx, ids);
  const bests = new Map<string, Partial<Record<RecordType, number>>>();
  const out: (typeof personalRecords.$inferInsert)[] = [];
  for (const s of sessions) {
    for (const [exerciseId, raw] of s.exercises) {
      const sets =
        measured.get(exerciseId) === "assisted_reps"
          ? raw.map((x) => ({ ...x, weightKg: null }))
          : raw;
      const best = bests.get(exerciseId) ?? {};
      for (const r of findRecords(sets, best)) {
        best[r.type] = r.value;
        out.push({
          userId,
          exerciseId,
          type: r.type,
          value: r.value,
          setId: r.set.id,
          achievedAt: r.set.completedAt ? new Date(r.set.completedAt) : s.finishedAt,
        });
      }
      bests.set(exerciseId, best);
    }
  }
  for (let i = 0; i < out.length; i += 500)
    await tx.insert(personalRecords).values(out.slice(i, i + 500));
  return out.length;
}

/** Called when a workout is finished: stores any new personal records it set. */
export async function recordPersonalRecords(
  tx: Tx,
  userId: string,
  finishedAt: Date,
  exercises: FinishedExercise[],
) {
  // The same exercise can appear twice in a workout; judge all its sets together. The
  // measurement comes from the exercise row, not from the device's copy.
  const measured = await measurements(
    tx,
    exercises.map((e) => e.exerciseId),
  );
  const byExercise = new Map<string, FinishedExercise["sets"]>();
  for (const e of exercises) {
    // For assisted work the weight is help, not load, so only the reps can be a record.
    const sets =
      (measured.get(e.exerciseId) ?? e.measurement) === "assisted_reps"
        ? e.sets.map((s) => ({ ...s, weightKg: null }))
        : e.sets;
    byExercise.set(e.exerciseId, [...(byExercise.get(e.exerciseId) ?? []), ...sets]);
  }
  const bests = await currentBests(tx, userId, [...byExercise.keys()]);
  const rows = [...byExercise].flatMap(([exerciseId, sets]) =>
    findRecords(sets, bests.get(exerciseId) ?? {}).map((r) => ({
      userId,
      exerciseId,
      type: r.type,
      value: r.value,
      setId: r.set.id,
      achievedAt: r.set.completedAt ? new Date(r.set.completedAt) : finishedAt,
    })),
  );
  if (rows.length) await tx.insert(personalRecords).values(rows);
  return rows;
}

/** Records set in one workout, keyed by set id. */
export async function recordsForWorkout(db: Database, userId: string, workoutId: string) {
  const rows = await db
    .select({ setId: personalRecords.setId, type: personalRecords.type })
    .from(personalRecords)
    .innerJoin(workoutSets, eq(workoutSets.id, personalRecords.setId))
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .where(and(eq(personalRecords.userId, userId), eq(workoutExercises.workoutId, workoutId)));
  const out: Record<string, RecordType[]> = {};
  for (const r of rows) (out[r.setId!] ??= []).push(r.type);
  return out;
}

/** The current best for each record type on one exercise. */
export async function exerciseRecords(db: Database, userId: string, exerciseId: string) {
  const rows = await db
    .selectDistinctOn([personalRecords.type], {
      type: personalRecords.type,
      value: personalRecords.value,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .where(and(eq(personalRecords.userId, userId), eq(personalRecords.exerciseId, exerciseId)))
    .orderBy(personalRecords.type, desc(personalRecords.value), personalRecords.achievedAt);
  return rows;
}

/** The latest records across all exercises, newest first. */
export async function recentRecords(db: Database, userId: string, limit = 10) {
  return db
    .select({
      id: personalRecords.id,
      exerciseId: personalRecords.exerciseId,
      exercise: exercises.name,
      type: personalRecords.type,
      value: personalRecords.value,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(eq(personalRecords.userId, userId))
    .orderBy(desc(personalRecords.achievedAt))
    .limit(limit);
}

/** Completed sessions of one exercise, oldest first (the most recent `limit`). */
export async function exerciseSessions(
  db: Database,
  userId: string,
  exerciseId: string,
  limit = 40,
): Promise<Session[]> {
  const recent = db
    .select({ id: workouts.id, finishedAt: workouts.finishedAt })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        sql`exists (select 1 from ${workoutExercises} we where we.workout_id = ${workouts.id} and we.exercise_id = ${exerciseId})`,
      ),
    )
    .orderBy(desc(workouts.finishedAt))
    .limit(limit)
    .as("recent");

  const rows = await db
    .select({
      workoutId: recent.id,
      finishedAt: recent.finishedAt,
      type: workoutSets.type,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceMeters: workoutSets.distanceMeters,
    })
    .from(recent)
    .innerJoin(workoutExercises, eq(workoutExercises.workoutId, recent.id))
    .innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(eq(workoutExercises.exerciseId, exerciseId))
    .orderBy(asc(recent.finishedAt), asc(workoutExercises.position), asc(workoutSets.setNumber));

  const out: Session[] = [];
  for (const { workoutId, finishedAt, ...set } of rows) {
    let s = out[out.length - 1];
    if (!s || s.workoutId !== workoutId) {
      s = { workoutId, date: finishedAt!.toISOString(), sets: [] };
      out.push(s);
    }
    s.sets.push(set);
  }
  return out;
}

/** Each exercise's best estimated max, strongest first, for the Progress page. */
export async function bestLifts(db: Database, userId: string, limit = 5) {
  const rows = await db
    .selectDistinctOn([personalRecords.exerciseId], {
      exerciseId: personalRecords.exerciseId,
      exercise: exercises.name,
      value: personalRecords.value,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(and(eq(personalRecords.userId, userId), eq(personalRecords.type, "best_e1rm")))
    .orderBy(personalRecords.exerciseId, desc(personalRecords.value));
  return rows.sort((a, b) => b.value - a.value).slice(0, limit);
}
