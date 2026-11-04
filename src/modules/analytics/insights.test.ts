import { describe, expect, it } from "vitest";
import {
  buildInsights,
  type InsightSet,
  lastWeeks,
  localDay,
  volumeBand,
  weekOf,
} from "./insights";

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekOf("2026-11-04")).toBe("2026-11-02");
    expect(weekOf("2026-11-08")).toBe("2026-11-02");
    expect(weekOf("2026-11-09")).toBe("2026-11-09");
    expect(lastWeeks("2026-11-04", 3)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });
  it("uses the user's local day", () => {
    const late = new Date("2026-11-08T23:30:00Z");
    expect(localDay(late, "UTC")).toBe("2026-11-08");
    expect(localDay(late, "Asia/Kolkata")).toBe("2026-11-09");
  });
});

const set = (p: Partial<InsightSet>): InsightSet => ({
  type: "working",
  weightKg: 100,
  reps: 5,
  durationSeconds: null,
  distanceMeters: null,
  workoutId: "w1",
  startedAt: new Date("2026-11-03T18:00:00Z"),
  finishedAt: new Date("2026-11-03T19:00:00Z"),
  exerciseId: "bench",
  exercise: "Bench",
  ...p,
});

describe("buildInsights", () => {
  const weeks = lastWeeks("2026-11-04", 2); // 26 Oct, 2 Nov
  const links = [
    { exerciseId: "bench", muscle: "chest", role: "primary" as const },
    { exerciseId: "bench", muscle: "triceps", role: "secondary" as const },
  ];

  it("totals the period, compares with the one before, and splits muscles by week", () => {
    const i = buildInsights(
      [
        set({}),
        set({}),
        set({ type: "warmup", weightKg: 40 }),
        set({ workoutId: "w2", startedAt: new Date("2026-10-27T18:00:00Z"), finishedAt: null }),
        // previous period
        set({ workoutId: "w0", startedAt: new Date("2026-10-13T18:00:00Z") }),
        // too old
        set({ workoutId: "wx", startedAt: new Date("2026-09-01T18:00:00Z") }),
      ],
      links,
      weeks,
      "UTC",
    );
    expect(i.totals).toEqual({ workouts: 2, sets: 3, volume: 1500, minutes: 60 });
    expect(i.previous).toMatchObject({ workouts: 1, sets: 1 });
    expect(i.weekly.map((w) => [w.workouts, w.sets])).toEqual([
      [1, 1],
      [1, 2],
    ]);
    expect(i.muscleAvg).toEqual([
      { muscle: "chest", perWeek: [1, 2], avg: 1.5 },
      { muscle: "triceps", perWeek: [0.5, 1], avg: 0.75 },
    ]);
    expect(i.topLifts[0]).toMatchObject({
      exerciseId: "bench",
      points: [{ y: 116.7 }, { y: 116.7 }],
    });
  });

  it("labels weekly volume", () => {
    expect(volumeBand(12).label).toBe("In range");
    expect(volumeBand(6).tone).toBe("low");
    expect(volumeBand(25).tone).toBe("high");
  });
});
