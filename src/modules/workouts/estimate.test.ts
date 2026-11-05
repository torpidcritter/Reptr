import { describe, expect, it } from "vitest";
import { adherence, estimateRemainingSeconds } from "./estimate";
import { emptyWorkout, exerciseFor } from "./start";

function workout(sets: number, rest: number | null = null) {
  const w = emptyWorkout();
  const e = exerciseFor(
    { exerciseId: crypto.randomUUID(), name: "Bench", measurement: "weight_reps" },
    { sets },
  );
  e.restSeconds = rest;
  w.exercises.push(e);
  return w;
}

describe("time left estimate", () => {
  it("uses a typical set plus rest before there's a pace to go on", () => {
    expect(estimateRemainingSeconds(workout(3, 120), 90)).toBe(3 * (40 + 120));
    expect(estimateRemainingSeconds(workout(2), 90)).toBe(2 * (40 + 90));
  });

  it("switches to this session's own pace after a few sets", () => {
    const w = workout(8);
    const start = Date.parse("2026-11-05T10:00:00Z");
    // Five sets done, 3 minutes apart, with one long interruption that's ignored.
    [0, 180, 360, 540, 1740].forEach((t, i) => {
      w.exercises[0].sets[i].completedAt = new Date(start + t * 1000).toISOString();
    });
    expect(estimateRemainingSeconds(w, 90)).toBe(3 * 180);
  });

  it("returns nothing when every set is done", () => {
    const w = workout(1);
    w.exercises[0].sets[0].completedAt = new Date().toISOString();
    expect(estimateRemainingSeconds(w, 90)).toBeNull();
  });
});

describe("adherence", () => {
  it("compares done with planned sets", () => {
    expect(adherence(12, 16)).toEqual({ done: 12, planned: 16, percent: 75 });
    expect(adherence(18, 16)!.percent).toBe(100);
    expect(adherence(5, null)).toBeNull();
  });
});
