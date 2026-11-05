import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { fatigueFor } from "./fatigue-queries";
import { runTool } from "./tools";

describe.skipIf(!testDatabaseUrl)("fatigue from stored training", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  let bench: string;

  beforeAll(async () => {
    t = await createTestDatabase("fatigue");
    await t.addUser(alice);
    [{ id: bench }] = await t.sql`select id from exercises where slug = 'barbell-bench-press'`;
    // Ten weekly sessions, each a little weaker than the last.
    for (let i = 0; i < 10; i++) {
      const w = emptyWorkout();
      w.startedAt = new Date(Date.now() - (70 - i * 7) * 86400000).toISOString();
      const e = exerciseFor(
        { exerciseId: bench, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets: 4 },
      );
      e.sets = e.sets.map((s) => ({
        ...s,
        weightKg: 100 - i * 3,
        reps: 5,
        completedAt: w.startedAt,
      }));
      w.exercises.push(e);
      w.status = "completed";
      w.finishedAt = w.startedAt;
      await saveWorkoutSnapshot(t.db, alice, w);
    }
  });
  afterAll(() => t?.close());

  it("reads falling performance and long hard stretches from the database", async () => {
    const f = await fatigueFor(t.db, alice, "UTC");
    expect(f.reasons.join(" ")).toMatch(/below your recent level/);
    expect(["building", "deload"]).toContain(f.level);

    const out = await runTool(
      { db: t.db, userId: alice, timeZone: "UTC", now: new Date() },
      "fatigue_check",
      "{}",
    );
    expect(out.result).toMatchObject({ level: f.level, confidence: f.confidence });
  });
});
