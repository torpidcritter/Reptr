import { describe, expect, it } from "vitest";
import { monthlyTimeline } from "./timeline";

describe("personal timeline", () => {
  it("rolls activity up by month, newest first", () => {
    const t = monthlyTimeline({
      workouts: [
        { day: "2026-09-02", volumeKg: 1000, minutes: 50 },
        { day: "2026-09-20", volumeKg: 1500, minutes: null },
        { day: "2026-10-01", volumeKg: 2000, minutes: 60 },
      ],
      records: [{ day: "2026-09-20" }, { day: "2026-10-01" }, { day: "2026-10-01" }],
      firsts: [{ day: "2026-09-02", name: "Bench" }],
      weights: [
        { day: "2026-08-30", value: 82 },
        { day: "2026-09-05", value: 81.5 },
        { day: "2026-09-28", value: 80.9 },
      ],
      milestones: [
        { reachedOn: "2026-09-02", title: "First workout" },
        { reachedOn: null, title: "10 workouts" },
      ],
    });
    expect(t.map((m) => m.month)).toEqual(["2026-10", "2026-09"]);
    expect(t[1]).toEqual({
      month: "2026-09",
      workouts: 2,
      volumeKg: 2500,
      minutes: 50,
      records: 1,
      firsts: ["Bench"],
      weight: { start: 81.5, end: 80.9 },
      milestones: ["First workout"],
    });
    expect(t[0]).toMatchObject({ records: 2, weight: null });
  });
});
