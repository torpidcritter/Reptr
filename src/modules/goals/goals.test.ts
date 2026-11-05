import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { logEntry } from "@/modules/body/body";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { archiveGoal, createGoal, GoalExerciseError, goalSchema, listGoals } from "./goals";

describe("goal form", () => {
  it("needs an exercise for a strength goal and a sensible target", () => {
    expect(goalSchema.safeParse({ kind: "strength", targetValue: "100" }).success).toBe(false);
    expect(goalSchema.safeParse({ kind: "consistency", targetValue: "0" }).success).toBe(false);
    const g = goalSchema.parse({ kind: "bodyweight", targetValue: "78.5", targetDate: "" });
    expect(g).toEqual({ kind: "bodyweight", targetValue: 78.5, targetDate: null });
  });
});

describe.skipIf(!testDatabaseUrl)("goals", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  let bench: string;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  beforeAll(async () => {
    t = await createTestDatabase("goals");
    await t.addUser(alice);
    await t.addUser(bob);
    [{ id: bench }] = await t.sql`select id from exercises where slug = 'barbell-bench-press'`;

    // Five weekly bench sessions, 5 reps, adding 2.5 kg each time.
    for (let i = 0; i < 5; i++) {
      const w = emptyWorkout();
      w.startedAt = daysAgo(35 - i * 7).toISOString();
      const e = exerciseFor(
        { exerciseId: bench, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets: 1 },
      );
      e.sets[0] = { ...e.sets[0], weightKg: 80 + i * 2.5, reps: 5, completedAt: w.startedAt };
      w.exercises.push(e);
      w.status = "completed";
      w.finishedAt = w.startedAt;
      await saveWorkoutSnapshot(t.db, alice, w);
    }
    for (let i = 0; i < 10; i++) {
      await logEntry(t.db, alice, {
        day: daysAgo(27 - i * 3)
          .toISOString()
          .slice(0, 10),
        values: { weight: 82 - i * 0.2 },
        bodyFatMethod: null,
      });
    }
  });
  afterAll(() => t?.close());

  it("tracks a strength goal from today's best and forecasts it", async () => {
    await createGoal(
      t.db,
      alice,
      { kind: "strength", exerciseId: bench, targetValue: 110, targetDate: null },
      "UTC",
    );
    const [g] = await listGoals(t.db, alice, "UTC");
    expect(g).toMatchObject({ kind: "strength", exerciseName: "Barbell Bench Press" });
    // Epley e1RM of 90 kg × 5.
    expect(g.current).toBeCloseTo(105, 0);
    expect(g.startValue).toBeCloseTo(105, 0);
    expect(g.forecast).toMatchObject({ status: "on_track", confidence: "medium" });
    expect(await listGoals(t.db, bob, "UTC")).toEqual([]);
    await archiveGoal(t.db, bob, g.id); // not theirs: nothing happens
    expect(await listGoals(t.db, alice, "UTC")).toHaveLength(1);
    await archiveGoal(t.db, alice, g.id);
    expect(await listGoals(t.db, alice, "UTC")).toEqual([]);
  });

  it("forecasts body weight from the trend and counts consistent weeks", async () => {
    await createGoal(t.db, alice, { kind: "bodyweight", targetValue: 78, targetDate: null }, "UTC");
    await createGoal(t.db, alice, { kind: "consistency", targetValue: 1, targetDate: null }, "UTC");
    const list = await listGoals(t.db, alice, "UTC");
    const weight = list.find((g) => g.kind === "bodyweight")!;
    expect(weight.current).toBeLessThan(82);
    expect(weight.forecast?.status).toBe("on_track");
    const habit = list.find((g) => g.kind === "consistency")!;
    expect(habit.weeks!.weeksHit).toBeGreaterThanOrEqual(4);
  });

  it("refuses another user's custom exercise", async () => {
    const [custom] = await t.sql`
      insert into exercises (owner_id, name, category) values (${bob}, 'Bob Press', 'resistance')
      returning id`;
    await expect(
      createGoal(
        t.db,
        alice,
        { kind: "strength", exerciseId: custom.id, targetValue: 50, targetDate: null },
        "UTC",
      ),
    ).rejects.toBeInstanceOf(GoalExerciseError);
  });
});
