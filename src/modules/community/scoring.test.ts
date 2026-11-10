import { describe, expect, it } from "vitest";
import { levelFor, periodRange, workoutXp, xpForLevel } from "./scoring";

describe("levels", () => {
  it("needs 125 × n × (n − 1) XP for level n", () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 250, 750, 1500, 2500]);
    expect(levelFor(0)).toMatchObject({ level: 1, intoLevel: 0, forNext: 250 });
    expect(levelFor(249).level).toBe(1);
    expect(levelFor(250)).toMatchObject({ level: 2, intoLevel: 0, forNext: 500 });
    expect(levelFor(1600)).toMatchObject({ level: 4, intoLevel: 100, forNext: 1000 });
  });

  it("caps the set and record parts of a workout's XP", () => {
    expect(workoutXp(0, 0)).toBe(50);
    expect(workoutXp(10, 1)).toBe(80);
    expect(workoutXp(100, 100)).toBe(150);
  });
});

describe("periods", () => {
  it("uses UTC weeks from Monday and calendar months", () => {
    const wed = new Date("2026-11-11T23:30:00Z");
    expect(periodRange("week", wed)).toEqual({
      from: new Date("2026-11-09T00:00:00Z"),
      to: new Date("2026-11-16T00:00:00Z"),
    });
    const sunday = new Date("2026-11-15T12:00:00Z");
    expect(periodRange("week", sunday).from).toEqual(new Date("2026-11-09T00:00:00Z"));
    expect(periodRange("month", wed)).toEqual({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-12-01T00:00:00Z"),
    });
    expect(periodRange("month", new Date("2026-12-31T23:59:59Z")).to).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    );
  });
});
