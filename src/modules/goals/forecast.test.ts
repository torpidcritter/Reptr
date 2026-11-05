import { describe, expect, it } from "vitest";
import {
  consistency,
  forecastBodyweight,
  forecastStrength,
  linearFit,
  progressPercent,
} from "./forecast";

const weekly = (start: string, values: number[]) =>
  values.map((value, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return { day: d.toISOString().slice(0, 10), value };
  });

describe("goal maths", () => {
  it("fits a straight line", () => {
    const fit = linearFit(weekly("2026-09-01", [100, 101, 102, 103]))!;
    expect(fit.slopePerDay * 7).toBeCloseTo(1);
    expect(fit.r2).toBeCloseTo(1);
    expect(linearFit([{ day: "2026-09-01", value: 1 }])).toBeNull();
  });

  it("shows progress for goals going up or down", () => {
    expect(progressPercent(100, 110, 120)).toBe(50);
    expect(progressPercent(90, 85, 80)).toBe(50); // losing weight
    expect(progressPercent(100, 95, 120)).toBe(0);
    expect(progressPercent(100, 130, 120)).toBe(100);
  });

  it("projects a steadily rising 1RM, with confidence from the data", () => {
    // +1 kg a week for 10 weeks, ending at 109 on 27 Oct, so the line is at 110 on 3 Nov.
    const sessions = weekly("2026-08-25", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    const f = forecastStrength(sessions, 115, "2026-11-03", 109);
    expect(f).toMatchObject({ status: "on_track", confidence: "high" });
    expect(f.status === "on_track" && f.eta).toBe("2026-12-08"); // 5 more weeks

    expect(forecastStrength(sessions, 105, "2026-11-03", 109)).toEqual({ status: "reached" });
    expect(forecastStrength(sessions.slice(-3), 115, "2026-11-03", 109).status).toBe(
      "not_enough_data",
    );
    const flat = weekly("2026-09-01", [100, 99, 100, 99, 100]);
    expect(forecastStrength(flat, 115, "2026-10-01", 100).status).toBe("not_moving");
  });

  it("projects body weight only when the trend heads toward the target", () => {
    const f = forecastBodyweight(80, -0.5, 78, "2026-11-05", 10);
    expect(f).toMatchObject({ status: "on_track", eta: "2026-12-03", confidence: "medium" });
    expect(forecastBodyweight(80, 0.3, 78, "2026-11-05", 10).status).toBe("not_moving");
    expect(forecastBodyweight(78.05, -0.5, 78, "2026-11-05", 10).status).toBe("reached");
    expect(forecastBodyweight(null, null, 78, "2026-11-05", 0).status).toBe("not_enough_data");
  });

  it("counts weeks a workouts-per-week goal was met", () => {
    // Last entry is the current, unfinished week.
    expect(consistency([3, 4, 2, 3, 3, 1], 3)).toEqual({
      weeksHit: 4,
      weeks: 5,
      streak: 2,
      thisWeek: 1,
    });
    expect(consistency([3, 3, 4], 3).streak).toBe(3);
  });
});
