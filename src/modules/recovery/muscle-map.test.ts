import { describe, expect, it } from "vitest";
import { recoveryHours, recoveryMap, type MuscleSet } from "./muscle-map";

const now = new Date("2026-11-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);
const sets = (
  workoutId: string,
  at: Date,
  muscle: string,
  n: number,
  role: MuscleSet["role"] = "primary",
) => Array.from({ length: n }, () => ({ workoutId, at, muscle, role }));

describe("muscle recovery map", () => {
  it("needs longer for big muscles and big sessions", () => {
    expect(recoveryHours("biceps", 4)).toBe(48);
    expect(recoveryHours("quads", 4)).toBe(60);
    expect(recoveryHours("quads", 10)).toBe(76);
    expect(recoveryHours("quads", 40)).toBe(96);
  });

  it("marks recently trained muscles as recovering, sore ones as sore", () => {
    const map = recoveryMap(
      [
        ...sets("w1", hoursAgo(20), "quads", 6),
        ...sets("w1", hoursAgo(20), "glutes", 6, "secondary"),
        ...sets("w0", hoursAgo(70), "chest", 8),
        ...sets("w2", hoursAgo(10), "biceps", 2, "secondary"),
      ],
      now,
      ["hamstrings"],
    );
    const by = Object.fromEntries(map.map((m) => [m.muscle, m]));
    expect(by.quads).toMatchObject({ status: "recovering", hoursLeft: 40 });
    expect(by.glutes).toMatchObject({ status: "recovering", hoursLeft: 40 }); // 3 weighted sets
    expect(by.chest).toMatchObject({ status: "ready", hoursLeft: 0 });
    expect(by.biceps).toMatchObject({ status: "recovering", hoursLeft: 38 });
    expect(by.hamstrings).toMatchObject({ status: "sore", lastTrained: null });
    expect(by.calves).toMatchObject({ status: "ready", lastTrained: null });
  });

  it("uses only the latest session of each muscle", () => {
    const [chest] = recoveryMap(
      [...sets("old", hoursAgo(100), "chest", 20), ...sets("new", hoursAgo(1), "chest", 2)],
      now,
      [],
    );
    expect(chest).toMatchObject({ hoursLeft: 59 });
  });
});
