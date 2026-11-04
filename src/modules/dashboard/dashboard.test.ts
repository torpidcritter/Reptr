import { describe, expect, it } from "vitest";
import { weekStreak } from "./dashboard";

describe("weekStreak", () => {
  it("counts back from this week, forgiving an empty current week", () => {
    expect(weekStreak([1, 0, 2, 3, 1])).toBe(3);
    expect(weekStreak([1, 2, 3, 0])).toBe(3);
    expect(weekStreak([2, 0, 0])).toBe(0);
    expect(weekStreak([])).toBe(0);
  });
});
