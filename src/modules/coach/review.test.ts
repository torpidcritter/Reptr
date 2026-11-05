import { describe, expect, it } from "vitest";
import { reviewSession } from "./review";

describe("session review", () => {
  it("calls out records, the best lift and anything that dipped", () => {
    const r = reviewSession({
      exercises: [
        { name: "Bench", pct: 3.2 },
        { name: "Squat", pct: -4 },
        { name: "Curl", pct: null },
      ],
      records: 2,
      volumeChange: 12,
      plan: { planned: 12, done: 9, percent: 75 },
      rpes: [10, 9.5, 10],
    });
    expect(r.headline).toBe("A record-setting session");
    expect(r.points.map((p) => p.tone)).toEqual([
      "good",
      "good",
      "watch",
      "info",
      "watch",
      "watch",
    ]);
    expect(r.points[1].text).toBe("Bench up 3.2% on your recent level.");
    expect(r.basis).toMatch(/2 exercises/);
  });

  it("reads an ordinary or a tough day without records", () => {
    expect(
      reviewSession({
        exercises: [{ name: "Bench", pct: 0.2 }],
        records: 0,
        volumeChange: 2,
        plan: null,
        rpes: [],
      }).headline,
    ).toBe("In line with your recent sessions");
    const tough = reviewSession({
      exercises: [{ name: "Bench", pct: -2.5 }],
      records: 0,
      volumeChange: null,
      plan: null,
      rpes: [6, 6, 6.5],
    });
    expect(tough.headline).toBe("A tougher day than usual");
    expect(tough.points.at(-1)!.text).toMatch(/room to add weight/);
    expect(
      reviewSession({ exercises: [], records: 0, volumeChange: null, plan: null, rpes: [] })
        .headline,
    ).toBe("Session logged");
  });
});
