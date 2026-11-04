import { describe, expect, it } from "vitest";
import type { CalcSet } from "./calc";
import { niceTicks } from "@/components/charts/scale";
import { isPlateau, sessionStats, suggestNext } from "./progression";

const s = (weightKg: number | null, reps: number, type: CalcSet["type"] = "working"): CalcSet => ({
  type,
  weightKg,
  reps,
  durationSeconds: null,
  distanceMeters: null,
});

describe("suggestNext", () => {
  it("adds a rep until every set hits the top of the range", () => {
    expect(suggestNext([s(60, 10), s(60, 9), s(60, 8)])).toMatchObject({
      kind: "add_reps",
      weightKg: 60,
      reps: 9,
    });
  });
  it("adds weight once every set reaches the top", () => {
    expect(suggestNext([s(40, 6, "warmup"), s(60, 12), s(60, 12)])).toMatchObject({
      kind: "add_weight",
      weightKg: 62.5,
      reps: 8,
    });
  });
  it("respects a routine's rep range and increment", () => {
    expect(
      suggestNext([s(100, 5), s(100, 5)], { repMin: 3, repMax: 5, incrementKg: 5 }),
    ).toMatchObject({ kind: "add_weight", weightKg: 105, reps: 3 });
  });
  it("handles bodyweight and a first time", () => {
    expect(suggestNext([s(null, 15), s(null, 12)], { weighted: false })).toMatchObject({
      kind: "add_reps",
      reps: 16,
    });
    expect(suggestNext(undefined).kind).toBe("start");
  });
});

describe("plateau and session stats", () => {
  it("flags three sessions without a new best", () => {
    expect(isPlateau([100, 105, 104, 105, 103])).toBe(true);
    expect(isPlateau([100, 105, 104, 106, 103])).toBe(false);
    expect(isPlateau([100, 100, 100])).toBe(false);
  });
  it("summarises working sets only", () => {
    expect(
      sessionStats({ date: "d", workoutId: "w", sets: [s(20, 10, "warmup"), s(60, 8)] }),
    ).toMatchObject({
      topWeight: 60,
      bestE1rm: 76,
      volume: 480,
      workingSets: 1,
    });
  });
});

describe("niceTicks", () => {
  it("gives round ticks covering the range", () => {
    expect(niceTicks(0, 95)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(61, 78)).toEqual([60, 65, 70, 75, 80]);
  });
});
