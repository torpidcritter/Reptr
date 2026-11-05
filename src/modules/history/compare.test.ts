import { describe, expect, it } from "vitest";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { compareWorkouts } from "./compare";

function workout(entries: [string, string, [number, number][]][]) {
  const w = emptyWorkout();
  for (const [id, name, sets] of entries) {
    const e = exerciseFor(
      { exerciseId: id, name, measurement: "weight_reps" },
      { sets: sets.length },
    );
    sets.forEach(([weightKg, reps], i) => {
      e.sets[i] = { ...e.sets[i], weightKg, reps, completedAt: "2026-11-01T10:00:00Z" };
    });
    w.exercises.push(e);
  }
  return w;
}

const bench = crypto.randomUUID();
const row = crypto.randomUUID();
const fly = crypto.randomUUID();

describe("comparing two workouts", () => {
  it("matches exercises and totals both sides", () => {
    const before = workout([
      [
        bench,
        "Bench",
        [
          [80, 8],
          [80, 7],
        ],
      ],
      [fly, "Fly", [[20, 12]]],
    ]);
    const after = workout([
      [row, "Row", [[70, 10]]],
      [
        bench,
        "Bench",
        [
          [82.5, 8],
          [82.5, 6],
        ],
      ],
    ]);
    const c = compareWorkouts(before, after);
    expect(c.rows.map((r) => r.name)).toEqual(["Row", "Bench", "Fly"]);
    const b = c.rows[1];
    expect(b.before!.topSet).toEqual({ weightKg: 80, reps: 8 });
    expect(b.after!.topSet).toEqual({ weightKg: 82.5, reps: 8 });
    expect(b.after!.bestE1rm! - b.before!.bestE1rm!).toBeCloseTo(2.5 * (1 + 8 / 30), 1); // e1RM is rounded to 0.1 kg
    expect(c.rows[0].before).toBeNull();
    expect(c.rows[2].after).toBeNull();
    expect(c.before).toEqual({ sets: 3, volumeKg: 80 * 15 + 240 });
    expect(c.after.volumeKg).toBe(700 + 82.5 * 14);
  });
});
