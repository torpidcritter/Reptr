"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { getRoutine } from "@/modules/routines/routines";
import { workoutSnapshotSchema, type WorkoutSnapshot } from "@/modules/workouts/snapshot";
import { workoutFromPast, workoutFromRoutine } from "@/modules/workouts/start";
import {
  getActiveWorkout,
  getWorkout,
  getPreviousPerformance,
  saveWorkoutSnapshot,
  WorkoutLockedError,
} from "@/modules/workouts/workouts";

export type SaveResult = { ok: true } | { ok: false; locked?: boolean; error: string };

export async function saveWorkoutAction(snapshot: WorkoutSnapshot): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = workoutSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await saveWorkoutSnapshot(db, user.id, parsed.data);
  } catch (e) {
    if (e instanceof WorkoutLockedError) return { ok: false, locked: true, error: e.message };
    throw e;
  }
  if (parsed.data.status === "completed") revalidatePath("/", "layout");
  return { ok: true };
}

export async function startFromRoutineAction(routineId: string) {
  const user = await requireUser();
  const routine = await getRoutine(db, user.id, routineId);
  if (!routine) return null;
  const previous = await getPreviousPerformance(
    db,
    user.id,
    routine.items.map((i) => i.exerciseId),
  );
  return workoutFromRoutine(routine, previous);
}

export async function getActiveWorkoutAction() {
  const user = await requireUser();
  return getActiveWorkout(db, user.id);
}

export async function previousPerformanceAction(exerciseIds: string[], excludeWorkoutId?: string) {
  const user = await requireUser();
  return getPreviousPerformance(db, user.id, exerciseIds.slice(0, 40), excludeWorkoutId);
}

export async function workoutSettingsAction() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return {
    unitSystem: profile?.unitSystem ?? "metric",
    defaultRestSeconds: profile?.defaultRestSeconds ?? 90,
  };
}

export async function repeatWorkoutAction(workoutId: string) {
  const user = await requireUser();
  const past = await getWorkout(db, user.id, workoutId);
  return past && past.status === "completed" ? workoutFromPast(past) : null;
}
