import { describe, expect, it } from "vitest";
import { e1rmFormulas } from "./calc";
import { strengthRatios } from "./ratios";

describe("strength ratios", () => {
  it("divides the best e1RM by body weight and finds the next milestone", () => {
    const r = strengthRatios(
      [
        { slug: "barbell-bench-press", exerciseId: "b", e1rm: 100 },
        { slug: "deadlift", exerciseId: "d", e1rm: null },
      ],
      80,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "Bench press", ratio: 1.25, reached: [1, 1.25], next: 1.5 });
    expect(r[0].toNext).toBeCloseTo(20);
  });

  it("still shows the lift without a body weight", () => {
    const [r] = strengthRatios([{ slug: "deadlift", exerciseId: "d", e1rm: 200 }], null);
    expect(r).toMatchObject({ ratio: null, next: null, toNext: null });
  });
});

describe("1RM formulas", () => {
  it("agree roughly around five reps and skip singles", () => {
    const f = e1rmFormulas(100, 5);
    expect(f.map((x) => x.name)).toEqual(["Epley", "Brzycki", "Lombardi", "Mayhew", "Wathan"]);
    expect(f[0].value).toBeCloseTo(116.7, 1);
    expect(f[1].value).toBeCloseTo(112.5, 1);
    for (const x of f) expect(x.value).toBeGreaterThan(110);
    expect(e1rmFormulas(100, 1)).toEqual([]);
  });
});
