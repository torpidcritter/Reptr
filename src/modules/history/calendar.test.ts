import { describe, expect, it } from "vitest";
import { monthGrid, monthKey, parseMonth } from "./calendar";

describe("training calendar", () => {
  it("lays out November 2026 in Monday-first weeks", () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks[0][0].date).toBe("2026-10-26");
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(weeks.at(-1)!.at(-1)!.date).toBe("2026-12-06");
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it("parses month keys and wraps month arithmetic", () => {
    expect(parseMonth("2026-02")).toEqual({ year: 2026, month: 1 });
    expect(parseMonth("nonsense", new Date(2026, 10, 4))).toEqual({ year: 2026, month: 10 });
    expect(monthKey(2026, 12)).toBe("2027-01");
    expect(monthKey(2026, -1)).toBe("2025-12");
  });
});
