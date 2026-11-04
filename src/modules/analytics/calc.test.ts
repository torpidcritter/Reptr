import { describe, expect, it } from "vitest";
import { type CalcSet, e1rm, findRecords, muscleSets, recordValues, totalVolume } from "./calc";

const set = (p: Partial<CalcSet>): CalcSet => ({
  type: "working",
  weightKg: null,
  reps: null,
  durationSeconds: null,
  distanceMeters: null,
  ...p,
});

describe("e1rm", () => {
  it("uses Epley", () => {
    expect(e1rm(100, 5)).toBe(116.7);
    expect(e1rm(60, 10)).toBe(80);
  });
  it("treats a single as its own max", () => expect(e1rm(140, 1)).toBe(140));
  it("skips sets it can't estimate", () => {
    expect(e1rm(null, 5)).toBeNull();
    expect(e1rm(100, 0)).toBeNull();
    expect(e1rm(40, 20)).toBeNull();
  });
});

describe("volume", () => {
  it("ignores warm-ups and non-weighted sets", () => {
    expect(
      totalVolume([
        set({ type: "warmup", weightKg: 40, reps: 10 }),
        set({ weightKg: 100, reps: 5 }),
        set({ type: "drop", weightKg: 80, reps: 8 }),
        set({ reps: 12 }),
      ]),
    ).toBe(1140);
  });
});

describe("records", () => {
  it("scores bodyweight reps but not weighted reps", () => {
    expect(recordValues(set({ reps: 15 })).most_reps).toBe(15);
    expect(recordValues(set({ weightKg: 50, reps: 15 })).most_reps).toBeUndefined();
    expect(recordValues(set({ type: "warmup", weightKg: 200, reps: 1 }))).toEqual({});
  });

  it("finds the best set per type that beats the old best", () => {
    const a = set({ weightKg: 100, reps: 5 });
    const b = set({ weightKg: 110, reps: 1 });
    const found = findRecords([a, b], { heaviest_weight: 105, best_e1rm: 120 });
    expect(found.map((r) => [r.type, r.value, r.set])).toEqual([
      ["heaviest_weight", 110, b],
      ["best_set_volume", 500, a],
    ]);
    expect(found[0].previous).toBe(105);
  });

  it("does not count a tie", () => {
    expect(
      findRecords([set({ weightKg: 100, reps: 1 })], {
        heaviest_weight: 100,
        best_e1rm: 100,
        best_set_volume: 100,
      }),
    ).toEqual([]);
  });
});

describe("muscleSets", () => {
  it("weights secondary muscles by half and skips warm-ups", () => {
    expect(
      muscleSets([
        {
          muscles: [
            { muscle: "chest", role: "primary" },
            { muscle: "triceps", role: "secondary" },
          ],
          sets: [{ type: "warmup" }, { type: "working" }, { type: "working" }, { type: "working" }],
        },
        { muscles: [{ muscle: "triceps", role: "primary" }], sets: [{ type: "working" }] },
      ]),
    ).toEqual({ chest: 3, triceps: 2.5 });
  });
});
