import { describe, expect, it } from "vitest";
import { exercises } from "./exercises";
import { equipmentList, muscles } from "./muscles";

describe("seed data", () => {
  it("has about 150 exercises with unique slugs and names", () => {
    expect(exercises.length).toBeGreaterThanOrEqual(150);
    expect(new Set(exercises.map((e) => e.slug)).size).toBe(exercises.length);
    expect(new Set(exercises.map((e) => e.name.toLowerCase())).size).toBe(exercises.length);
  });

  it("gives every exercise valid muscle contributions", () => {
    const valid = new Set<string>(muscles.map((m) => m.slug));
    for (const e of exercises) {
      const entries = Object.entries(e.muscles);
      expect(entries.length, e.name).toBeGreaterThan(0);
      for (const [slug, c] of entries) {
        expect(valid.has(slug), `${e.name}: ${slug}`).toBe(true);
        expect(c, `${e.name}: ${slug}`).toBeGreaterThan(0);
        expect(c, `${e.name}: ${slug}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives every strength exercise at least one primary muscle", () => {
    const strength = exercises.filter((e) => ["resistance", "bodyweight"].includes(e.category));
    for (const e of strength) {
      expect(Math.max(...Object.values(e.muscles)), e.name).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("only uses known equipment", () => {
    const valid = new Set<string>(equipmentList.map((q) => q.slug));
    for (const e of exercises) expect(valid.has(e.equipment), e.name).toBe(true);
  });

  it("trains every muscle group with at least two exercises", () => {
    for (const m of muscles) {
      const count = exercises.filter((e) => (e.muscles[m.slug] ?? 0) >= 0.75).length;
      expect(count, m.name).toBeGreaterThanOrEqual(2);
    }
  });
});
