import { describe, expect, it } from "vitest";
import { exerciseFor, emptyWorkout } from "@/modules/workouts/start";
import { applyDeload, blockWeek, weekKinds } from "./block";

describe("training blocks", () => {
  it("places a deload every Nth week", () => {
    expect(weekKinds(8, 4)).toEqual([
      "build",
      "build",
      "build",
      "deload",
      "build",
      "build",
      "build",
      "deload",
    ]);
    expect(weekKinds(3, null)).toEqual(["build", "build", "build"]);
  });

  it("knows which week it is", () => {
    const block = { startDate: "2026-11-02", weeks: 6, deloadEvery: 3 };
    expect(blockWeek(block, "2026-10-31")).toMatchObject({ status: "upcoming", startsIn: 2 });
    expect(blockWeek(block, "2026-11-02")).toMatchObject({
      status: "active",
      week: 1,
      kind: "build",
      nextDeload: 3,
    });
    expect(blockWeek(block, "2026-11-22")).toMatchObject({
      week: 3,
      kind: "deload",
      nextDeload: 6,
    });
    expect(blockWeek(block, "2026-12-07")).toMatchObject({ week: 6, nextDeload: null });
    expect(blockWeek(block, "2026-12-14").status).toBe("finished");
    expect(blockWeek({ ...block, deloadEvery: null }, "2026-11-02")).toMatchObject({
      nextDeload: null,
    });
  });

  it("halves sets and lightens the load for a deload", () => {
    const w = emptyWorkout();
    const bench = exerciseFor(
      { exerciseId: crypto.randomUUID(), name: "Bench", measurement: "weight_reps" },
      { sets: 4 },
    );
    bench.sets = bench.sets.map((s) => ({ ...s, weightKg: 100, reps: 5 }));
    const curl = exerciseFor(
      { exerciseId: crypto.randomUUID(), name: "Curl", measurement: "weight_reps" },
      { sets: 1 },
    );
    curl.sets[0].weightKg = 12;
    const plank = exerciseFor(
      { exerciseId: crypto.randomUUID(), name: "Plank", measurement: "time" },
      { sets: 3 },
    );
    w.exercises.push(bench, curl, plank);
    const d = applyDeload(w);
    expect(d.exercises[0].sets).toHaveLength(2);
    expect(d.exercises[0].sets[0]).toMatchObject({ weightKg: 90, reps: 5 });
    expect(d.exercises[1].sets).toHaveLength(1);
    expect(d.exercises[1].sets[0].weightKg).toBe(10.5);
    expect(d.exercises[2].sets).toHaveLength(2);
    expect(d.notes).toMatch(/Deload week/);
  });
});
