"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { syncAwardsQuietly } from "@/modules/community/awards";
import { z } from "zod";
import { overLimit } from "@/lib/guard";
import { log, timed } from "@/lib/log";
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
  type SyncConflict,
  type SyncInfo,
  WorkoutConflictError,
  WorkoutValidationError,
} from "@/modules/workouts/workouts";
import type { SyncFailure } from "@/modules/sync/errors";
import { failure } from "@/modules/sync/server";
import { countSync } from "@/modules/sync/stats";

export type SaveResult =
  | { ok: true; version: number; merged?: WorkoutSnapshot; alreadyFinished?: boolean }
  | { ok: false; kind: "conflict"; conflict: SyncConflict; error: string }
  | SyncFailure;

const syncSchema = z
  .object({
    deviceId: z.string().min(8).max(64),
    baseVersion: z.number().int().min(0).nullable(),
    takeOver: z.boolean().optional(),
  })
  .optional();

export async function saveWorkoutAction(
  snapshot: WorkoutSnapshot,
  sync?: SyncInfo,
): Promise<SaveResult> {
  const result = await saveWorkout(snapshot, sync);
  after(() => countSync(db, "workout", result.ok ? "ok" : result.kind));
  return result;
}

async function saveWorkout(snapshot: WorkoutSnapshot, sync?: SyncInfo): Promise<SaveResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, kind: "rate_limited", error: busy };
  const parsed = workoutSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return { ok: false, kind: "validation", error: parsed.error.issues[0].message };
  }
  const device = syncSchema.safeParse(sync);
  let out: Awaited<ReturnType<typeof saveWorkoutSnapshot>>;
  try {
    out = await timed("workout_save", () =>
      saveWorkoutSnapshot(db, user.id, parsed.data, device.success ? device.data : undefined),
    );
  } catch (e) {
    if (e instanceof WorkoutConflictError) {
      log.warn("workout_sync_conflict", { kind: e.conflict.kind, workoutId: parsed.data.id });
      return { ok: false, kind: "conflict", conflict: e.conflict, error: e.message };
    }
    if (e instanceof WorkoutValidationError)
      return { ok: false, kind: "validation", error: e.message };
    return failure("workout_save_failed", e);
  }
  if (parsed.data.status === "completed") {
    // XP, badges and challenge progress, worked out from what was just saved.
    await syncAwardsQuietly(db, user.id);
    revalidatePath("/", "layout");
  }
  if (out.merged) log.info("workout_merged", { workoutId: parsed.data.id });
  return {
    ok: true,
    version: out.version,
    merged: out.merged,
    alreadyFinished: out.alreadyFinished,
  };
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
