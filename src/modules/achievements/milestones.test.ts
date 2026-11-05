import { describe, expect, it } from "vitest";
import { weekOf } from "@/modules/analytics/insights";
import { milestones } from "./milestones";

const day = (n: number) => new Date(Date.UTC(2026, 0, 5) + n * 86400000).toISOString().slice(0, 10);

describe("milestones", () => {
  it("dates each round number when it was crossed, and shows the next one", () => {
    // 12 workouts, one every 3 days, 3 tonnes each.
    const workouts = Array.from({ length: 12 }, (_, i) => ({ day: day(i * 3), volumeKg: 3000 }));
    const m = milestones(workouts, weekOf);
    const get = (k: string) => m.find((x) => x.key === k);

    expect(get("workouts-1")!.reachedOn).toBe(day(0));
    expect(get("workouts-10")!.reachedOn).toBe(day(27));
    expect(get("workouts-25")).toMatchObject({ reachedOn: null, progress: 48 });
    expect(get("workouts-50")).toBeUndefined(); // only the next target is listed

    expect(get("volume-10")!.reachedOn).toBe(day(9)); // 4th workout: 12 t
    expect(get("volume-50")).toMatchObject({ reachedOn: null, progress: 72 });

    // 36 days of training covers six weeks in a row; 8 is next.
    expect(get("streak-4")!.reachedOn).not.toBeNull();
    expect(get("streak-8")!.reachedOn).toBeNull();
  });

  it("restarts a streak after a missed week", () => {
    const workouts = [0, 7, 14, 28, 35, 42, 49, 56].map((d) => ({ day: day(d), volumeKg: 0 }));
    const m = milestones(workouts, weekOf);
    expect(m.find((x) => x.key === "streak-4")!.reachedOn).toBe(day(49));
  });
});
