import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { exerciseRecords, recordsForWorkout } from "@/modules/analytics/records";
import { correctWorkout, deleteFinishedWorkout } from "./corrections";
import type { WorkoutSnapshot } from "./snapshot";
import { emptyWorkout, exerciseFor } from "./start";
import { getWorkout, saveWorkoutSnapshot, WorkoutValidationError } from "./workouts";

describe.skipIf(!testDatabaseUrl)("correcting finished workouts", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const me = randomUUID();
  const other = randomUUID();
  const ex: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase("corrections");
    await t.addUser(me);
    await t.addUser(other);
    for (const r of await t.sql`select id, slug from exercises where owner_id is null`)
      ex[r.slug] = r.id;
  });
  afterAll(() => t?.close());

  async function finished(kg: number, reps: number, daysAgo: number, slug = "barbell-bench-press") {
    const w = emptyWorkout();
    w.exercises.push(
      exerciseFor({ exerciseId: ex[slug], name: slug, measurement: "weight_reps" }, { sets: 1 }),
    );
    const at = new Date(Date.now() - daysAgo * 86400_000);
    w.startedAt = new Date(at.getTime() - 3600_000).toISOString();
    w.exercises[0].sets[0] = {
      ...w.exercises[0].sets[0],
      weightKg: kg,
      reps,
      completedAt: at.toISOString(),
    };
    w.status = "completed";
    w.finishedAt = at.toISOString();
    await saveWorkoutSnapshot(t.db, me, w);
    return w;
  }

  const best = async (type: string, slug = "barbell-bench-press") =>
    (await exerciseRecords(t.db, me, ex[slug])).find((r) => r.type === type)?.value ?? null;

  let typo: WorkoutSnapshot;
  let later: WorkoutSnapshot;

  it("rebuilds records when a mistyped weight is fixed", async () => {
    typo = await finished(100, 5, 3); // meant 80
    later = await finished(90, 5, 1);
    expect(await best("heaviest_weight")).toBe(100);
    expect(await recordsForWorkout(t.db, me, later.id)).toEqual({});

    const fixed = structuredClone(typo);
    fixed.exercises[0].sets[0].weightKg = 80;
    await correctWorkout(t.db, me, fixed);

    expect(await best("heaviest_weight")).toBe(90);
    // The later workout now holds the record it really set.
    expect(Object.values(await recordsForWorkout(t.db, me, later.id)).flat()).toContain(
      "heaviest_weight",
    );
    expect((await getWorkout(t.db, me, typo.id))!.exercises[0].sets[0].weightKg).toBe(80);
  });

  it("moves records with the exercise when the wrong one was picked", async () => {
    const fixed = structuredClone(later);
    fixed.exercises[0].exerciseId = ex["barbell-row"];
    await correctWorkout(t.db, me, fixed);
    expect(await best("heaviest_weight")).toBe(80);
    expect(await best("heaviest_weight", "barbell-row")).toBe(90);
  });

  it("drops a deleted set and its records", async () => {
    const fixed = structuredClone(typo);
    fixed.exercises[0].sets[0].weightKg = 80;
    fixed.exercises[0].sets.push({
      ...fixed.exercises[0].sets[0],
      id: randomUUID(),
      weightKg: 85,
    });
    await correctWorkout(t.db, me, fixed);
    expect(await best("heaviest_weight")).toBe(85);
    fixed.exercises[0].sets.pop();
    await correctWorkout(t.db, me, fixed);
    expect(await best("heaviest_weight")).toBe(80);
  });

  it("deletes a finished workout and the records it held", async () => {
    await deleteFinishedWorkout(t.db, me, later.id);
    expect(await getWorkout(t.db, me, later.id)).toBeNull();
    expect(await best("heaviest_weight", "barbell-row")).toBeNull();
    expect(await best("heaviest_weight")).toBe(80);
  });

  it("won't touch another person's workout, or one still in progress", async () => {
    const fixed = structuredClone(typo);
    expect(await correctWorkout(t.db, other, fixed)).toBeNull();
    expect(await deleteFinishedWorkout(t.db, other, typo.id)).toBeNull();
    expect((await getWorkout(t.db, me, typo.id))!.status).toBe("completed");

    const active = emptyWorkout();
    await saveWorkoutSnapshot(t.db, me, active, { deviceId: "phone-device-1", baseVersion: null });
    await expect(
      correctWorkout(t.db, me, {
        ...active,
        status: "completed",
        finishedAt: new Date().toISOString(),
        exercises: typo.exercises,
      }),
    ).rejects.toBeInstanceOf(WorkoutValidationError);
  });

  it("refuses a correction that ends before it starts or keeps no sets", async () => {
    const backwards = { ...structuredClone(typo), finishedAt: "2000-01-01T00:00:00.000Z" };
    await expect(correctWorkout(t.db, me, backwards)).rejects.toThrow(/before it started/);
    const empty = { ...structuredClone(typo), exercises: [] };
    await expect(correctWorkout(t.db, me, empty)).rejects.toThrow(/at least one set/);
  });
});
