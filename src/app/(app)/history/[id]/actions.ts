"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { audit } from "@/modules/ops/audit";
import { correctWorkout, deleteFinishedWorkout } from "@/modules/workouts/corrections";
import { workoutSnapshotSchema } from "@/modules/workouts/snapshot";
import { WorkoutValidationError } from "@/modules/workouts/workouts";

export type CorrectionResult = { ok: true } | { ok: false; error: string };

const changed = () => revalidatePath("/", "layout");

/** Saves a corrected copy of a finished workout. Records are rebuilt from it. */
export async function correctWorkoutAction(snapshot: unknown): Promise<CorrectionResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, error: busy };
  const parsed = workoutSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const res = await correctWorkout(db, user.id, parsed.data);
    if (!res) return { ok: false, error: "That workout wasn't found." };
    await audit(db, user.id, "workout_corrected", {
      workout: parsed.data.id,
      exercises: res.exerciseIds.length,
    });
  } catch (err) {
    if (err instanceof WorkoutValidationError) return { ok: false, error: err.message };
    log.error("workout_correction_failed", { err });
    return { ok: false, error: "The correction couldn't be saved. Nothing was changed." };
  }
  changed();
  return { ok: true };
}

/** Deletes a finished workout and the records it held. */
export async function deleteWorkoutAction(id: string): Promise<CorrectionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That workout wasn't found." };
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, error: busy };
  try {
    const res = await deleteFinishedWorkout(db, user.id, id);
    if (!res) return { ok: false, error: "That workout wasn't found." };
    await audit(db, user.id, "workout_deleted", { workout: id });
  } catch (err) {
    if (err instanceof WorkoutValidationError) return { ok: false, error: err.message };
    log.error("workout_delete_failed", { err });
    return { ok: false, error: "The workout couldn't be deleted. Nothing was changed." };
  }
  changed();
  return { ok: true };
}
