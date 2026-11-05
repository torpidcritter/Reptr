import { describe, expect, it } from "vitest";
import {
  factorEffects,
  pearson,
  performanceByWorkout,
  strengthOf,
  type PerfSet,
} from "./correlations";

const set = (workoutId: string, day: string, exerciseId: string, weightKg: number): PerfSet => ({
  workoutId,
  day,
  exerciseId,
  weightKg,
  reps: 5,
  type: "working",
  durationSeconds: null,
  distanceMeters: null,
});

describe("session performance", () => {
  it("scores sessions against the previous three of each exercise", () => {
    const sets = [
      set("w1", "2026-10-01", "bench", 100),
      set("w2", "2026-10-03", "bench", 100),
      set("w3", "2026-10-05", "bench", 103),
      set("w3", "2026-10-05", "bench", 90), // lighter set in the same session doesn't count
      set("w4", "2026-10-07", "bench", 97),
    ];
    const p = performanceByWorkout(sets);
    expect(p.map((x) => x.workoutId)).toEqual(["w3", "w4"]);
    expect(p[0].score).toBeCloseTo(3, 1);
    expect(p[1].score).toBeCloseTo((97 / 101 - 1) * 100, 1);
  });
});

describe("correlation", () => {
  it("computes Pearson's r and names its strength", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(strengthOf(0.1)).toBe("no clear");
    expect(strengthOf(-0.5)).toBe("moderate");
  });

  it("compares sessions after more and less sleep, once there are enough", () => {
    const perf = Array.from({ length: 10 }, (_, i) => ({
      workoutId: `w${i}`,
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      score: i % 2 ? 2 : -1,
    }));
    const sleep = (day: string) => (Number(day.slice(-2)) % 2 === 0 ? 8 : 6);
    const [e] = factorEffects(perf, [
      { key: "sleep", label: "Sleep", high: (s) => `${s} h or more`, valueFor: sleep },
    ]);
    expect(e).toMatchObject({ n: 10, strength: "strong", highLabel: "8 h or more" });
    expect(e.gap).toBeCloseTo(3);

    const [few] = factorEffects(perf.slice(0, 5), [
      { key: "sleep", label: "Sleep", high: () => "", valueFor: sleep },
    ]);
    expect(few).toEqual({ key: "sleep", label: "Sleep", n: 5 });
  });
});
