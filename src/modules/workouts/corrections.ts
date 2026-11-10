import { and, eq } from "drizzle-orm";
import { workoutExercises, workouts } from "@/db/schema";
import type { Database } from "@/db/types";
import { rebuildPersonalRecords } from "@/modules/analytics/records";
import type { WorkoutSnapshot } from "./snapshot";
import {
  assertExercisesVisible,
  keepDone,
  replaceContents,
  WorkoutValidationError,
} from "./workouts";

// Fixing a finished workout: a mistyped weight, a set logged twice, the wrong exercise
// picked. Every change rebuilds the personal records of every exercise it touched, so a
// record can never outlive the set that earned it.

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type WorkoutChange = {
  workoutId: string;
  /** Exercises whose history changed, before and after the edit. */
  exerciseIds: string[];
};

/** Something that keeps derived data (records, scores) in step after a workout changes. */
export type AfterWorkoutChange = (tx: Tx, userId: string, change: WorkoutChange) => Promise<void>;

const afterChange: AfterWorkoutChange[] = [];

/** Registers work to do in the same transaction after a finished workout is corrected or deleted. */
export function onWorkoutChanged(fn: AfterWorkoutChange) {
  afterChange.push(fn);
}

async function exerciseIdsOf(tx: Tx, workoutId: string) {
  const rows = await tx
    .select({ id: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  return rows.map((r) => r.id);
}

async function lockFinished(tx: Tx, userId: string, workoutId: string) {
  const [row] = await tx
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .for("update");
  if (!row) return null;
  if (row.status !== "completed") {
    throw new WorkoutValidationError("Only a finished workout can be corrected here");
  }
  return row;
}

/**
 * Replaces a finished workout's contents with a corrected copy. Only sets marked done
 * are kept; times must still make sense. Returns null if the workout isn't this user's.
 */
export async function correctWorkout(db: Database, userId: string, fixed: WorkoutSnapshot) {
  if (fixed.status !== "completed" || !fixed.finishedAt) {
    throw new WorkoutValidationError("A corrected workout stays finished");
  }
  if (Date.parse(fixed.finishedAt) < Date.parse(fixed.startedAt)) {
    throw new WorkoutValidationError("The workout can't end before it started");
  }
  const kept = keepDone(fixed.exercises, true);
  if (!kept.length)
    throw new WorkoutValidationError("Keep at least one set, or delete the workout");
  await assertExercisesVisible(db, userId, fixed);

  return db.transaction(async (tx) => {
    const row = await lockFinished(tx, userId, fixed.id);
    if (!row) return null;
    const before = await exerciseIdsOf(tx, fixed.id);
    await tx
      .update(workouts)
      .set({
        name: fixed.name,
        notes: fixed.notes,
        startedAt: new Date(fixed.startedAt),
        finishedAt: new Date(fixed.finishedAt!),
        version: row.version + 1,
      })
      .where(eq(workouts.id, fixed.id));
    // Exercise ids are kept where they match, so links to this workout stay valid.
    await replaceContents(tx, userId, fixed.id, kept);
    const change = {
      workoutId: fixed.id,
      exerciseIds: [...new Set([...before, ...kept.map((e) => e.exerciseId)])],
    };
    await rebuildPersonalRecords(tx, userId, change.exerciseIds);
    for (const fn of afterChange) await fn(tx, userId, change);
    return { version: row.version + 1, exerciseIds: change.exerciseIds };
  });
}

/** Deletes a finished workout and everything derived from it. */
export async function deleteFinishedWorkout(db: Database, userId: string, workoutId: string) {
  return db.transaction(async (tx) => {
    const row = await lockFinished(tx, userId, workoutId);
    if (!row) return null;
    const before = await exerciseIdsOf(tx, workoutId);
    await tx.delete(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
    const change = { workoutId, exerciseIds: before };
    await rebuildPersonalRecords(tx, userId, before);
    for (const fn of afterChange) await fn(tx, userId, change);
    return { exerciseIds: before };
  });
}
