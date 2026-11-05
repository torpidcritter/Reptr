import { describe, expect, it } from "vitest";
import { addDays, datesBetween, plannedByWeekday, scheduleAdherence, weekdayOf } from "./schedule";

describe("training schedule", () => {
  it("numbers weekdays from Monday", () => {
    expect(weekdayOf("2026-11-02")).toBe(0); // Monday
    expect(weekdayOf("2026-11-08")).toBe(6); // Sunday
  });

  it("lists routines planned on each weekday", () => {
    const byDay = plannedByWeekday([
      { id: "a", name: "Push", scheduleDays: [0, 3] },
      { id: "b", name: "Pull", scheduleDays: [1, 3] },
    ]);
    expect(byDay[3].map((r) => r.name)).toEqual(["Push", "Pull"]);
    expect(byDay[6]).toEqual([]);
  });

  it("counts planned days kept, missed, and extra sessions", () => {
    const dates = datesBetween("2026-11-02", "2026-11-15"); // two full weeks
    expect(dates).toHaveLength(14);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    // Planned Mon, Wed, Fri. Trained both Mondays, one Wednesday and a Saturday.
    const trained = new Set(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-14"]);
    const r = scheduleAdherence(dates, new Set([0, 2, 4]), trained);
    expect(r).toMatchObject({ planned: 6, done: 3, extra: 1, percent: 50 });
    expect(r.missed).toEqual(["2026-11-06", "2026-11-11", "2026-11-13"]);
    expect(scheduleAdherence(dates, new Set(), trained).percent).toBeNull();
  });
});
