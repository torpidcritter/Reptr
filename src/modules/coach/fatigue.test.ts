import { describe, expect, it } from "vitest";
import { assessFatigue, hardWeeksInARow, type FatigueInput } from "./fatigue";

const base: FatigueInput = {
  loadRatio: 1,
  monotony: 1,
  recentPerformance: [0.5, 1, 0.8],
  weeklySets: [40, 42, 20, 40, 41, 43, 40, 42, 44, 41, 40, 12],
  checkins: [],
  today: "2026-11-05",
  inDeload: false,
};

const checkins = (
  recent: { sleepHours: number; energy: number; soreness: number },
  usual: typeof recent,
) =>
  Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 5 - (27 - i)));
    const day = d.toISOString().slice(0, 10);
    return { day, ...(i >= 21 ? recent : usual) };
  });

describe("fatigue", () => {
  it("counts hard weeks since the last lighter one", () => {
    expect(hardWeeksInARow(base.weeklySets)).toBe(8);
    expect(hardWeeksInARow([40, 40, 10, 40, 40, 5])).toBe(2);
    expect(hardWeeksInARow([0, 0, 40])).toBe(0);
  });

  it("calls a well-recovered lifter fresh or normal", () => {
    const r = assessFatigue({ ...base, weeklySets: [40, 20, 40, 40, 40, 12] });
    expect(r.level).toBe("fresh");
    expect(r.reasons).toEqual([]);
  });

  it("recommends a deload when several signals line up", () => {
    const r = assessFatigue({
      ...base,
      loadRatio: 1.6,
      recentPerformance: [-1, -3, -2.5, -4],
      checkins: checkins(
        { sleepHours: 6, energy: 2, soreness: 4 },
        { sleepHours: 7.5, energy: 4, soreness: 2 },
      ),
    });
    expect(r.level).toBe("deload");
    expect(r.confidence).toBe("high");
    expect(r.reasons.length).toBeGreaterThanOrEqual(5);
    expect(r.reasons.join(" ")).toMatch(/8 hard weeks/);
  });

  it("says fatigue is building on a couple of signals, with less confidence without data", () => {
    const r = assessFatigue({
      ...base,
      loadRatio: null,
      monotony: null,
      recentPerformance: [],
      weeklySets: [30, 30, 30, 30, 30, 30, 30, 30, 10],
    });
    expect(r).toMatchObject({ level: "building", confidence: "low", hardWeeks: 8 });
  });

  it("stays calm during a planned deload", () => {
    expect(assessFatigue({ ...base, loadRatio: 2, inDeload: true }).level).toBe("deloading");
  });
});
