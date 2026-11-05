import { describe, expect, it } from "vitest";
import { adaptiveTdee, caloriesBurned, completeDays, weeklyNutrition } from "./report";

const day = (i: number) =>
  new Date(Date.parse("2026-10-01T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);

describe("calories burned", () => {
  it("scales training and steps by body weight", () => {
    expect(caloriesBurned(80, 60, 10000)).toEqual({ training: 280, walking: 457, total: 737 });
    expect(caloriesBurned(70, 0, null)).toEqual({ training: 0, walking: 0, total: 0 });
  });
});

describe("maintenance estimate", () => {
  const intakes = Array.from({ length: 28 }, (_, i) => ({
    day: day(i),
    calories: 2500,
    proteinG: 150,
  }));
  it("subtracts the deficit implied by losing weight", () => {
    // Losing 0.5 kg a week on 2500 kcal: maintenance is about 2500 + 550.
    const trend = Array.from({ length: 28 }, (_, i) => ({
      day: day(i),
      value: 80 - (0.5 / 7) * i,
    }));
    const t = adaptiveTdee(intakes, trend)!;
    expect(t.kcal).toBe(3050);
    expect(t.confidence).toBe("high");
  });
  it("needs two weeks of logging and a trend", () => {
    expect(adaptiveTdee(intakes.slice(0, 10), [{ day: day(0), value: 80 }])).toBeNull();
    expect(adaptiveTdee(intakes, [{ day: day(27), value: 80 }])).toBeNull();
  });
  it("leaves out days that look half-logged", () => {
    expect(
      completeDays([
        { day: day(0), calories: 2400, proteinG: 0 },
        { day: day(1), calories: 600, proteinG: 0 },
        { day: day(2), calories: 2600, proteinG: 0 },
      ]).map((d) => d.day),
    ).toEqual([day(0), day(2)]);
  });
});

describe("weekly report", () => {
  it("averages logged days and counts days on target", () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i + 1));
    const r = weeklyNutrition({
      days,
      intakes: [
        { day: day(1), calories: 2000, proteinG: 150 },
        { day: day(2), calories: 2600, proteinG: 120 },
        { day: day(3), calories: 2150, proteinG: 160 },
        { day: day(20), calories: 9000, proteinG: 0 },
      ],
      targets: { calories: 2100, proteinG: 150 },
      trend: [
        { day: day(0), value: 80 },
        { day: day(7), value: 79.6 },
      ],
      burned: [300, 0, 500, 0, 0, 200, 0],
    });
    expect(r).toMatchObject({
      daysLogged: 3,
      avgCalories: 2250,
      avgProteinG: 143,
      caloriesOnTarget: 2,
      proteinOnTarget: 2,
      weightChangeKg: -0.4,
      avgBurned: 143,
    });
  });
});
