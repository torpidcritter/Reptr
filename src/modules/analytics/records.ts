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

/** Called when a workout is finished: stores any new personal records it set. */
export async function recordPersonalRecords(
  tx: Tx,
  userId: string,
  finishedAt: Date,
  exercises: FinishedExercise[],
) {
  // The same exercise can appear twice in a workout; judge all its sets together.
  const byExercise = new Map<string, FinishedExercise["sets"]>();
  for (const e of exercises) {
    // For assisted work the weight is help, not load, so only the reps can be a record.
    const sets =
      e.measurement === "assisted_reps" ? e.sets.map((s) => ({ ...s, weightKg: null })) : e.sets;
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
