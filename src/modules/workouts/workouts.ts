import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { exercises, routines, workoutExercises, workouts, workoutSets } from "@/db/schema";
import type { Database } from "@/db/types";
import { recordPersonalRecords } from "@/modules/analytics/records";
import { mergeWorkouts } from "./merge";
import type { ExerciseSnapshot, SetSnapshot, WorkoutSnapshot } from "./snapshot";

import type { SyncConflict } from "@/modules/sync/conflict";

export type { SyncConflict };

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class WorkoutConflictError extends Error {
  constructor(readonly conflict: SyncConflict) {
    super(conflictMessage(conflict));
    this.name = "WorkoutConflictError";
  }
}

/** A snapshot the server can't accept as it is, such as an exercise it doesn't know. */
export class WorkoutValidationError extends Error {}

function conflictMessage(c: SyncConflict) {
  if (c.kind === "finished_elsewhere") return "This workout was already finished on another device";
  if (c.kind === "active_elsewhere") return "Another workout is in progress on another device";
  return "This workout belongs to a different account";
}

/**
 * How a device identifies itself when saving. `takeOver` is only sent after the person
 * chose to finish the workout running on another device and continue with this one.
 */
export type SyncInfo = { deviceId: string; baseVersion: number | null; takeOver?: boolean };

/** Completed sets in the device's copy that the server's copy doesn't have. */
export function unsyncedSets(server: WorkoutSnapshot, device: WorkoutSnapshot) {
  const known = new Set(server.exercises.flatMap((e) => e.sets.map((s) => s.id)));
  return device.exercises.flatMap((e) =>
    e.sets.filter((s) => s.completedAt && !known.has(s.id)).map((s) => s.id),
  );
}

/**
 * Saves the device's copy of a workout. While it's in progress the server copy is
 * replaced wholesale (or combined, when another device saved in between). Once
 * completed or abandoned it's locked: a copy with nothing new is accepted as a retry,
 * a copy with sets the server never got is refused as a conflict, so the device can
 * keep them and offer to save them separately.
 */
export async function saveWorkoutSnapshot(
  db: Database,
  userId: string,
  incoming: WorkoutSnapshot,
  sync?: SyncInfo,
) {
  let w = incoming;
  await assertExercisesVisible(db, userId, w);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workouts).where(eq(workouts.id, w.id)).for("update");

    if (existing && existing.userId !== userId) {
      throw new WorkoutConflictError({ kind: "wrong_account" });
    }
    if (existing && (existing.status === "completed" || existing.status === "abandoned")) {
      const server = await loadSnapshot(tx as unknown as Database, existing);
      const missing = unsyncedSets(server, w);
      if (missing.length) {
        throw new WorkoutConflictError({
          kind: "finished_elsewhere",
          status: existing.status,
          unsyncedSetIds: missing,
        });
      }
      // Nothing here the server doesn't have: a retry of the finish, or a stale copy.
      return {
        status: existing.status,
        version: existing.version,
        merged: undefined,
        alreadyFinished: existing.status !== w.status,
      };
    }

    // Another device saved since this one last heard from the server: combine the two
    // copies instead of letting this save overwrite theirs.
    let merged: WorkoutSnapshot | undefined;
    if (
      existing &&
      sync &&
      existing.deviceId &&
      existing.deviceId !== sync.deviceId &&
      sync.baseVersion !== existing.version
    ) {
      const theirs = await loadSnapshot(tx as unknown as Database, existing);
      w = merged = mergeWorkouts(theirs, w);
    }
    const version = (existing?.version ?? 0) + 1;

    const finishing = w.status === "completed" || w.status === "abandoned";
    const finishedAt = finishing ? new Date(w.finishedAt ?? Date.now()) : null;

    // One workout in progress at a time. A newer one from the same device replaces an
    // older one from that device (the device itself moved on). One from another device
    // is never ended silently: the person decides, and if they choose to take over, it's
    // finished with its logged sets kept, not thrown away.
    if (!finishing) {
      const others = await tx
        .select()
        .from(workouts)
        .where(
          and(
            eq(workouts.userId, userId),
            ne(workouts.id, w.id),
            inArray(workouts.status, ["active", "paused"]),
          ),
        )
        .for("update");
      for (const other of others) {
        const sameDevice = sync && other.deviceId === sync.deviceId;
        if (!sameDevice && !sync?.takeOver) {
          throw new WorkoutConflictError({
            kind: "active_elsewhere",
            other: { id: other.id, name: other.name, startedAt: other.startedAt.toISOString() },
          });
        }
        await endInProgress(tx, userId, other);
      }
    }

    const row = {
      plannedSets: w.exercises.reduce((n, e) => n + e.sets.length, 0),
      name: w.name,
      // Only a routine of this user's can be linked (a guessed id is dropped).
      routineId: await ownRoutineId(tx, userId, w.routineId),
      status: w.status,
      startedAt: new Date(w.startedAt),
      finishedAt,
      notes: w.notes,
      version,
      deviceId: sync?.deviceId ?? existing?.deviceId ?? null,
    };
    await tx
      .insert(workouts)
      .values({ id: w.id, userId, ...row })
      .onConflictDoUpdate({ target: workouts.id, set: row });

    // A finished workout keeps only the sets that were done, and the exercises that have any.
    const kept = keepDone(w.exercises, finishing);
    await replaceContents(tx, userId, w.id, kept);
    if (w.status === "completed") await recordPersonalRecords(tx, userId, finishedAt!, kept);
    return { status: w.status, version, merged, alreadyFinished: false };
  });
}

/**
 * Ends a workout that's in progress so another can start: finished with the sets that
 * were done, or abandoned if none were. Logged sets are never dropped.
 */
async function endInProgress(tx: Tx, userId: string, row: typeof workouts.$inferSelect) {
  const db = tx as unknown as Database;
  const snap = await loadSnapshot(db, row);
  const anyDone = snap.exercises.some((e) => e.sets.some((s) => s.completedAt));
  const finishedAt = new Date();
  await db
    .update(workouts)
    .set({
      status: anyDone ? "completed" : "abandoned",
      finishedAt,
      version: row.version + 1,
    })
    .where(eq(workouts.id, row.id));
  if (!anyDone) return;
  // Same rule as a normal finish: only the sets that were done are kept.
  await db.delete(workoutSets).where(
    and(
      eq(workoutSets.userId, userId),
      isNull(workoutSets.completedAt),
      inArray(
        workoutSets.workoutExerciseId,
        snap.exercises.map((e) => e.id),
      ),
    ),
  );
  const kept = snap.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.completedAt) }))
    .filter((e) => e.sets.length);
  const empty = snap.exercises.filter((e) => !e.sets.some((s) => s.completedAt)).map((e) => e.id);
  if (empty.length) await db.delete(workoutExercises).where(inArray(workoutExercises.id, empty));
  await recordPersonalRecords(tx, userId, finishedAt, kept);
}

/** A finished workout keeps only the sets that were done, and the exercises that have any. */
export function keepDone(list: ExerciseSnapshot[], finishing: boolean) {
  return list
    .map((e) => ({ ...e, sets: finishing ? e.sets.filter((s) => s.completedAt) : e.sets }))
    .filter((e) => !finishing || e.sets.length > 0);
}

/** Replaces a workout's exercises and sets with the given ones. */
export async function replaceContents(
  tx: Tx,
  userId: string,
  workoutId: string,
  kept: ExerciseSnapshot[],
) {
  await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));
  if (!kept.length) return;
  await tx.insert(workoutExercises).values(
    kept.map((e, i) => ({
      id: e.id,
      userId,
      workoutId,
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

async function ownRoutineId(tx: Tx, userId: string, routineId: string | null) {
  if (!routineId) return null;
  const [r] = await tx
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)));
  return r?.id ?? null;
}

/** Checks every exercise is one this user may use (a shared one, or their own). */
export async function assertExercisesVisible(
  db: Database | Tx,
  userId: string,
  w: WorkoutSnapshot,
) {
  const ids = [
    ...new Set(w.exercises.flatMap((e) => [e.exerciseId, e.substitutedFromId ?? e.exerciseId])),
  ];
  if (!ids.length) return;
  const visible = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(inArray(exercises.id, ids), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))),
    );
  if (visible.length !== ids.length) throw new WorkoutValidationError("Unknown exercise");
}

/** The workout in progress on the server, if any, as a snapshot (for resuming on another device). */
export async function getActiveWorkout(db: Database, userId: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), inArray(workouts.status, ["active", "paused"])))
    .limit(1);
  return w ? { ...(await loadSnapshot(db, w)), version: w.version } : null;
}

export async function getWorkout(db: Database, userId: string, id: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
  return w ? { ...(await loadSnapshot(db, w)), plannedSets: w.plannedSets } : null;
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
