import { describe, expect, it } from "vitest";
import { onboardingFromForm, onboardingSchema } from "./onboarding";

const base = { unitSystem: "metric", goal: "all_round" };

describe("onboarding form", () => {
  it("accepts the minimum: units and goal", () => {
    expect(onboardingSchema.parse(base)).toEqual({
      displayName: null,
      unitSystem: "metric",
      dateOfBirth: null,
      heightCm: null,
      weightKg: null,
      goal: "all_round",
      experience: null,
      trainingDays: [],
      trainingDaysPerWeek: null,
      equipment: [],
    });
  });

  it("treats empty form fields as not given", () => {
    const v = onboardingSchema.parse({
      ...base,
      displayName: " ",
      height: "",
      experience: "",
    });
    expect(v.heightCm).toBeNull();
    expect(v.displayName).toBeNull();
    expect(v.experience).toBeNull();
  });

  it("stores height in cm whichever units were used", () => {
    expect(onboardingSchema.parse({ ...base, height: "178" }).heightCm).toBe(178);
    expect(onboardingSchema.parse({ ...base, unitSystem: "imperial", height: "70" }).heightCm).toBe(
      177.8,
    );
  });

  it("catches a height entered in the wrong units", () => {
    const r = onboardingSchema.safeParse({ ...base, height: "70" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["height"]);
  });

  it("keeps the ticked weekdays and equipment from the form, once each", () => {
    const form = new FormData();
    form.set("unitSystem", "metric");
    form.set("goal", "strength");
    for (const d of ["4", "0", "2", "0"]) form.append("trainingDays", d);
    for (const x of ["dumbbells", "barbell"]) form.append("equipment", x);
    const v = onboardingSchema.parse(onboardingFromForm(form));
    expect(v.trainingDays).toEqual([0, 2, 4]);
    expect(v.trainingDaysPerWeek).toBe(3);
    expect(v.equipment).toEqual(["dumbbells", "barbell"]);
    expect(onboardingSchema.safeParse({ ...base, equipment: ["spaceship"] }).success).toBe(false);
  });

  it("turns weight into kg and age into a birth year", () => {
    const v = onboardingSchema.parse({ ...base, unitSystem: "imperial", weight: "180", age: "30" });
    expect(v.weightKg).toBe(81.6);
    expect(v.dateOfBirth).toBe(`${new Date().getFullYear() - 30}-01-01`);
    expect(onboardingSchema.safeParse({ ...base, weight: "8" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, age: "9" }).success).toBe(false);
  });

  it("rejects unknown goals", () => {
    expect(onboardingSchema.safeParse({ ...base, goal: "bulk" }).success).toBe(false);
  });
});
