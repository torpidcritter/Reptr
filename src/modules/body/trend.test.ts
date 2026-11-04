import { describe, expect, it } from "vitest";
import { dailyReadings, trendLine, weeklyRate } from "./trend";

describe("weight trend", () => {
  it("averages several weigh-ins on one day", () => {
    expect(
      dailyReadings([
        { day: "2026-11-02", value: 80 },
        { day: "2026-11-01", value: 81 },
        { day: "2026-11-02", value: 81 },
      ]),
    ).toEqual([
      { day: "2026-11-01", value: 81 },
      { day: "2026-11-02", value: 80.5 },
    ]);
  });

  it("smooths out a one-day spike", () => {
    const days = Array.from({ length: 10 }, (_, i) => ({
      day: `2026-10-${String(i + 10).padStart(2, "0")}`,
      value: i === 5 ? 83 : 80,
    }));
    const trend = trendLine(days);
    expect(Math.max(...trend.map((r) => r.value))).toBeLessThan(80.4);
  });

  it("treats a gap as several days", () => {
    const [, b] = trendLine([
      { day: "2026-10-01", value: 80 },
      { day: "2026-10-11", value: 78 },
    ]);
    expect(b.value).toBeCloseTo(80 - 2 * (1 - 0.9 ** 10), 2);
  });

  it("measures the weekly rate of change", () => {
    const steady = Array.from({ length: 29 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 1 + i));
      return { day: d.toISOString().slice(0, 10), value: 80 - i * (0.5 / 7) };
    });
    expect(weeklyRate(steady)).toBeCloseTo(-0.5, 2);
    expect(weeklyRate(steady.slice(0, 3))).toBeNull();
  });
});
