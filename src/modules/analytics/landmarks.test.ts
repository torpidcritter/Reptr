import { describe, expect, it } from "vitest";
import { landmarkRead, neglectedMuscles, trainingLoad } from "./landmarks";

describe("volume landmarks", () => {
  it("reads weekly sets against each muscle's guide", () => {
    expect(landmarkRead("chest", 4)).toMatchObject({ label: "Maintenance", tone: "low" });
    expect(landmarkRead("chest", 10)).toMatchObject({ label: "Light", tone: "ok" });
    expect(landmarkRead("chest", 15)).toMatchObject({ label: "Productive" });
    expect(landmarkRead("chest", 21)).toMatchObject({ label: "Near max", tone: "high" });
    expect(landmarkRead("chest", 30)).toMatchObject({ label: "Above max" });
    expect(landmarkRead("adductors", 12)).toMatchObject({ label: "In range", landmarks: null });
  });

  it("flags major muscles with almost no work", () => {
    const avg = new Map([
      ["chest", 12],
      ["calves", 1],
    ]);
    const n = neglectedMuscles(avg);
    expect(n).toContain("calves");
    expect(n).toContain("hamstrings");
    expect(n).not.toContain("chest");
  });
});

describe("training load", () => {
  const days = (week: number[], earlier: number) => [
    ...Array.from({ length: 21 }, (_, i) => (i % 7 < 3 ? earlier : 0)),
    ...week,
  ];

  it("compares this week with the four-week average", () => {
    const steady = trainingLoad(days([15, 0, 15, 0, 15, 0, 0], 15));
    expect(steady.acute).toBe(45);
    expect(steady.ratio).toBeCloseTo(1);
    expect(steady.read).toBe("steady");
    expect(steady.monotonous).toBe(false);

    expect(trainingLoad(days([25, 25, 25, 0, 25, 25, 0], 10)).read).toBe("spike");
    expect(trainingLoad(days([0, 0, 10, 0, 0, 0, 0], 15)).read).toBe("drop");
    expect(trainingLoad(Array(28).fill(0)).read).toBe("not_enough");
  });

  it("calls the same load every day monotonous", () => {
    const flat = trainingLoad(Array(28).fill(10));
    expect(flat.monotony).toBe(10);
    expect(flat.monotonous).toBe(true);
  });
});

describe("daily counts", () => {
  it("buckets set days into the last 28 days", async () => {
    const { last28Days } = await import("./landmarks");
    const d = last28Days(
      ["2026-11-05", "2026-11-05", "2026-11-04", "2026-10-08", "2026-10-09"],
      "2026-11-05",
    );
    expect(d[27]).toBe(2);
    expect(d[26]).toBe(1);
    expect(d[0]).toBe(1); // 9 Oct is 27 days ago; 8 Oct is out of range
    expect(d.reduce((a, b) => a + b)).toBe(4);
  });
});
