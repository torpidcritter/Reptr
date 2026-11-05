import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { sessionReviewFor } from "./review-queries";
import { runTool } from "./tools";

describe.skipIf(!testDatabaseUrl)("session review from stored workouts", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  const ids: string[] = [];

  beforeAll(async () => {
    t = await createTestDatabase("review");
    await t.addUser(alice);
    await t.addUser(bob);
    const [{ id: bench }] =
      await t.sql`select id from exercises where slug = 'barbell-bench-press'`;
    for (const [i, kg] of [100, 100, 100, 105].entries()) {
      const w = emptyWorkout();
      w.name = "Push";
      w.startedAt = new Date(Date.now() - (30 - i * 7) * 86400000).toISOString();
      const e = exerciseFor(
        { exerciseId: bench, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets: 3 },
      );
      e.sets = e.sets.map((s) => ({ ...s, weightKg: kg, reps: 5, completedAt: w.startedAt }));
      w.exercises.push(e);
      w.status = "completed";
      w.finishedAt = w.startedAt;
      await saveWorkoutSnapshot(t.db, alice, w);
      ids.push(w.id);
    }
  });
  afterAll(() => t?.close());

  it("reviews the latest session against earlier ones", async () => {
    const r = (await sessionReviewFor(t.db, alice, ids[3], "UTC"))!;
    expect(r.exercises).toEqual([{ name: "Barbell Bench Press", vsRecentPct: 5 }]);
    expect(r.headline).toBe("A record-setting session");
    expect(r.points.some((p) => p.text.includes("Volume up 5%"))).toBe(true);
    expect(await sessionReviewFor(t.db, bob, ids[3], "UTC")).toBeNull();

    const out = await runTool(
      { db: t.db, userId: alice, timeZone: "UTC", now: new Date() },
      "review_workout",
      "{}",
    );
    expect(out.result).toMatchObject({ workout: { id: ids[3], name: "Push" } });
  });
});
