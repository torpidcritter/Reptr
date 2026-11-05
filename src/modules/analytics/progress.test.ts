import { describe, expect, it } from "vitest";
import { consistency, splitSentence, strengthChange, strengthSentence } from "./progress";

describe("progress in plain words", () => {
  it("describes a lift's change only with two or more sessions", () => {
    expect(strengthChange([{ x: 1, y: 100 }])).toBeNull();
    const c = strengthChange([
      { x: 1, y: 100 },
      { x: 2, y: 104 },
      { x: 3, y: 108 },
    ])!;
    expect(c).toMatchObject({ pct: 8, best: 108, sessions: 3 });
    expect(strengthSentence("Bench Press", c)).toBe(
      "Your estimated Bench Press max is up 8% over 3 sessions.",
    );
    expect(strengthSentence("Squat", { ...c, pct: 0 })).toBe(
      "Your Squat is holding steady over 3 sessions.",
    );
  });

  it("averages weeks only from the first workout on", () => {
    expect(consistency([0, 0, 0])).toBeNull();
    expect(consistency([0, 0, 3, 2, 0, 3])).toEqual({
      perWeek: 2,
      weeksTrained: 3,
      weeks: 4,
      total: 8,
    });
  });

  it("names the most and least trained muscles", () => {
    expect(splitSentence([{ name: "Chest", avg: 10 }])).toBeNull();
    expect(
      splitSentence([
        { name: "Quads", avg: 12 },
        { name: "Chest", avg: 10 },
        { name: "Back", avg: 8 },
        { name: "Calves", avg: 2 },
      ]),
    ).toBe("Most of your work went to Quads and Chest. Calves got the least, under 4 sets a week.");
  });
});
