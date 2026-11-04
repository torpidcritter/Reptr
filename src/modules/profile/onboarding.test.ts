import { describe, expect, it } from "vitest";
import { onboardingSchema } from "./onboarding";

const base = { unitSystem: "metric", goal: "all_round" };

describe("onboarding form", () => {
  it("accepts the minimum: units and goal", () => {
    expect(onboardingSchema.parse(base)).toEqual({
      displayName: null,
      unitSystem: "metric",
      heightCm: null,
      goal: "all_round",
      experience: null,
      trainingDaysPerWeek: null,
    });
  });

  it("treats empty form fields as not given", () => {
    const v = onboardingSchema.parse({
      ...base,
      displayName: " ",
      height: "",
      experience: "",
      trainingDaysPerWeek: "",
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

  it("limits training days to 1–7", () => {
    expect(onboardingSchema.safeParse({ ...base, trainingDaysPerWeek: "8" }).success).toBe(false);
    expect(onboardingSchema.parse({ ...base, trainingDaysPerWeek: "4" }).trainingDaysPerWeek).toBe(
      4,
    );
  });

  it("rejects unknown goals", () => {
    expect(onboardingSchema.safeParse({ ...base, goal: "bulk" }).success).toBe(false);
  });
});
