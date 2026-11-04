import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { exerciseRecords, recordsForWorkout } from "@/modules/analytics/records";
import { getRoutine, routineSchema, saveRoutine } from "@/modules/routines/routines";
import { isSetFilled, summarize, workoutSnapshotSchema, type WorkoutSnapshot } from "./snapshot";
import { emptyWorkout, exerciseFor, plannedSets, workoutFromRoutine } from "./start";
import {
  getActiveWorkout,
  getPreviousPerformance,
  getWorkout,
  saveWorkoutSnapshot,
  WorkoutLockedError,
} from "./workouts";

const done = (w: WorkoutSnapshot, ...exerciseIdx: number[]) => {
  for (const i of exerciseIdx)
    for (const s of w.exercises[i].sets) s.completedAt = new Date().toISOString();
  return w;
};

describe("workout helpers", () => {
  it("prefills planned sets from last time, ignoring warm-ups", () => {
    const sets = plannedSets(3, {
      date: "2026-11-01T00:00:00Z",
      sets: [
        {
          id: randomUUID(),
          type: "warmup",
          weightKg: 20,
          reps: 10,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completedAt: "x",
        },
        {
          id: randomUUID(),
          type: "working",
          weightKg: 60,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completedAt: "x",
        },
        {
          id: randomUUID(),
          type: "working",
          weightKg: 60,
          reps: 7,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completedAt: "x",
        },
      ],
    });
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [60, 8],
      [60, 7],
      [60, 7],
    ]);
    expect(sets.every((s) => s.completedAt === null && s.type === "working")).toBe(true);
  });

  it("knows when a set is filled in for each kind of exercise", () => {
    const s = plannedSets(1)[0];
    expect(isSetFilled(s, "weight_reps")).toBe(false);
    expect(isSetFilled({ ...s, weightKg: 50, reps: 5 }, "weight_reps")).toBe(true);
    expect(isSetFilled({ ...s, reps: 10 }, "reps")).toBe(true);
    expect(isSetFilled({ ...s, reps: 8 }, "assisted_reps")).toBe(true);
    expect(isSetFilled({ ...s, durationSeconds: 60 }, "time")).toBe(true);
    expect(isSetFilled({ ...s, durationSeconds: 600 }, "distance_time")).toBe(false);
  });

  it("names an empty workout by time of day", () => {
    expect(emptyWorkout(new Date(2026, 10, 4, 7)).name).toBe("Morning workout");
    expect(emptyWorkout(new Date(2026, 10, 4, 19)).name).toBe("Evening workout");
  });
});

describe.skipIf(!testDatabaseUrl)("saving workouts", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  const ex: Record<string, { id: string; measurement: "weight_reps" }> = {};

  beforeAll(async () => {
    t = await createTestDatabase("workouts");
    await t.addUser(alice);
    await t.addUser(bob);
    for (const r of await t.sql`select id, slug, measurement from exercises where owner_id is null`) {
      ex[r.slug] = { id: r.id, measurement: r.measurement };
    }
  });
  afterAll(() => t?.close());

  const bench = () => ({
    exerciseId: ex["barbell-bench-press"].id,
    name: "Barbell Bench Press",
    measurement: "weight_reps" as const,
  });
  const row = () => ({
    exerciseId: ex["barbell-row"].id,
    name: "Barbell Row",
    measurement: "weight_reps" as const,
  });

  it("saves an in-progress workout repeatedly and resumes it", async () => {
    const w = emptyWorkout();
    w.exercises.push(exerciseFor(bench(), { sets: 3 }));
    w.exercises[0].sets[0] = {
      ...w.exercises[0].sets[0],
      weightKg: 60,
      reps: 8,
      completedAt: new Date().toISOString(),
    };
    workoutSnapshotSchema.parse(w);

    await saveWorkoutSnapshot(t.db, alice, w);
    await saveWorkoutSnapshot(t.db, alice, w); // a retry changes nothing
    w.exercises.push(exerciseFor(row(), { sets: 2 }));
    await saveWorkoutSnapshot(t.db, alice, w);

    const active = await getActiveWorkout(t.db, alice);
    expect(active!.id).toBe(w.id);
    expect(active!.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ["Barbell Bench Press", 3],
      ["Barbell Row", 2],
    ]);
    expect(active!.exercises[0].sets[0]).toMatchObject({ weightKg: 60, reps: 8 });
    expect(await getActiveWorkout(t.db, bob)).toBeNull();
  });

  it("keeps only completed sets when finishing, then locks the workout", async () => {
    const w = (await getActiveWorkout(t.db, alice))!;
    w.exercises[0].sets[1] = {
      ...w.exercises[0].sets[1],
      weightKg: 60,
      reps: 7,
      completedAt: new Date().toISOString(),
    };
    w.status = "completed";
    w.finishedAt = new Date().toISOString();
    await saveWorkoutSnapshot(t.db, alice, w);
    await saveWorkoutSnapshot(t.db, alice, w); // retry of the finish is fine

    const saved = (await getWorkout(t.db, alice, w.id))!;
    expect(saved.status).toBe("completed");
    expect(saved.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ["Barbell Bench Press", 2],
    ]);
    expect(summarize(saved)).toEqual({ sets: 2, volumeKg: 60 * 8 + 60 * 7, exercises: 1 });

    await expect(
      saveWorkoutSnapshot(t.db, alice, { ...w, status: "active" }),
    ).rejects.toBeInstanceOf(WorkoutLockedError);
    expect(await getActiveWorkout(t.db, alice)).toBeNull();
  });

  it("returns last time's sets for each exercise", async () => {
    const prev = await getPreviousPerformance(t.db, alice, [
      ex["barbell-bench-press"].id,
      ex["barbell-row"].id,
    ]);
    expect(prev[ex["barbell-bench-press"].id].sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [60, 8],
      [60, 7],
    ]);
    expect(prev[ex["barbell-row"].id]).toBeUndefined();
    expect(await getPreviousPerformance(t.db, bob, [ex["barbell-bench-press"].id])).toEqual({});
  });

  it("starts a workout from a routine with last time's numbers", async () => {
    const { id } = await saveRoutine(
      t.db,
      alice,
      routineSchema.parse({
        name: "Push",
        items: [{ exerciseId: ex["barbell-bench-press"].id, targetSets: 3, restSeconds: 120 }],
      }),
    );
    const routine = (await getRoutine(t.db, alice, id))!;
    const prev = await getPreviousPerformance(
      t.db,
      alice,
      routine.items.map((i) => i.exerciseId),
    );
    const w = workoutFromRoutine(routine, prev);
    expect(w.name).toBe("Push");
    expect(w.exercises[0].restSeconds).toBe(120);
    expect(w.exercises[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [60, 8],
      [60, 7],
      [60, 7],
    ]);
  });

  it("abandons an older in-progress workout when a new one is saved", async () => {
    const a = emptyWorkout();
    await saveWorkoutSnapshot(t.db, alice, a);
    const b = emptyWorkout();
    await saveWorkoutSnapshot(t.db, alice, b);
    expect((await getActiveWorkout(t.db, alice))!.id).toBe(b.id);
    expect((await getWorkout(t.db, alice, a.id))!.status).toBe("abandoned");
  });

  it("stores personal records when a workout is finished", async () => {
    const first = await exerciseRecords(t.db, alice, ex["barbell-bench-press"].id);
    expect(Object.fromEntries(first.map((r) => [r.type, r.value]))).toEqual({
      heaviest_weight: 60,
      best_e1rm: 76,
      best_set_volume: 480,
    });

    const w = emptyWorkout();
    w.exercises.push(exerciseFor(bench(), { sets: 2 }));
    w.exercises[0].sets[0] = { ...w.exercises[0].sets[0], weightKg: 65, reps: 3 };
    w.exercises[0].sets[1] = { ...w.exercises[0].sets[1], weightKg: 40, reps: 20, type: "warmup" };
    done(w, 0);
    w.status = "completed";
    w.finishedAt = new Date().toISOString();
    await saveWorkoutSnapshot(t.db, alice, w);
    await saveWorkoutSnapshot(t.db, alice, w); // a retry doesn't double up

    const prs = await recordsForWorkout(t.db, alice, w.id);
    expect(Object.values(prs)).toEqual([["heaviest_weight"]]);
    const now = await exerciseRecords(t.db, alice, ex["barbell-bench-press"].id);
    expect(now.find((r) => r.type === "heaviest_weight")!.value).toBe(65);
    expect(await exerciseRecords(t.db, bob, ex["barbell-bench-press"].id)).toEqual([]);
  });

  it("won't let another user overwrite a workout", async () => {
    const w = done(emptyWorkout());
    await saveWorkoutSnapshot(t.db, alice, w);
    await expect(saveWorkoutSnapshot(t.db, bob, w)).rejects.toBeInstanceOf(WorkoutLockedError);
  });
});
