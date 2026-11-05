"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { z } from "zod";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { localDay } from "@/modules/analytics/insights";
import { applyDeload, blockWeek } from "@/modules/programs/block";
import { activeProgram } from "@/modules/programs/programs";
import { getRoutine } from "@/modules/routines/routines";
import { workoutSnapshotSchema, type WorkoutSnapshot } from "@/modules/workouts/snapshot";
import { workoutFromPast, workoutFromRoutine } from "@/modules/workouts/start";
import {
  getActiveWorkout,
  getWorkout,
  getPreviousPerformance,
  saveWorkoutSnapshot,
  type SyncInfo,
  WorkoutLockedError,
} from "@/modules/workouts/workouts";

export type SaveResult =
  | { ok: true; version: number; merged?: WorkoutSnapshot }
  | { ok: false; locked?: boolean; error: string };

const syncSchema = z
  .object({ deviceId: z.string().min(8).max(64), baseVersion: z.number().int().min(0).nullable() })
  .optional();

export async function saveWorkoutAction(
  snapshot: WorkoutSnapshot,
  sync?: SyncInfo,
): Promise<SaveResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, error: busy };
  const parsed = workoutSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const device = syncSchema.safeParse(sync);
  let out: Awaited<ReturnType<typeof saveWorkoutSnapshot>>;
  try {
    out = await saveWorkoutSnapshot(
      db,
      user.id,
      parsed.data,
      device.success ? device.data : undefined,
    );
  } catch (e) {
    if (e instanceof WorkoutLockedError) return { ok: false, locked: true, error: e.message };
    throw e;
  }
  if (parsed.data.status === "completed") revalidatePath("/", "layout");
  if (out.merged) log.info("workout_merged", { workoutId: parsed.data.id });
  return { ok: true, version: out.version, merged: out.merged };
}

export async function startFromRoutineAction(routineId: string) {
  const user = await requireUser();
  const routine = await getRoutine(db, user.id, routineId);
  if (!routine) return null;
  const [previous, program, tz] = await Promise.all([
    getPreviousPerformance(
      db,
      user.id,
      routine.items.map((i) => i.exerciseId),
    ),
    activeProgram(db, user.id),
    getTimeZone(),
  ]);
  const workout = workoutFromRoutine(routine, previous);
  // In a deload week of the current block, start lighter.
  const week = program && blockWeek(program, localDay(new Date(), tz));
  return week?.status === "active" && week.kind === "deload" ? applyDeload(workout) : workout;
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
