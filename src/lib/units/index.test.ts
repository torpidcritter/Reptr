import { describe, expect, it } from "vitest";
import { displayWeight, inToCm, cmToIn, kgToLb, lbToKg, toStoredWeight, weightUnitLabel } from ".";

describe("units", () => {
  it("round-trips kg and lb", () => {
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 10);
  });

  it("round-trips cm and in", () => {
    expect(inToCm(cmToIn(180))).toBeCloseTo(180, 10);
  });

  it("displays stored kg in the user's units", () => {
    expect(displayWeight(100, "metric")).toBe(100);
    expect(displayWeight(100, "imperial")).toBe(220.5);
  });

  it("stores typed pounds as kg", () => {
    expect(toStoredWeight(225, "imperial")).toBeCloseTo(102.058, 3);
    expect(toStoredWeight(60, "metric")).toBe(60);
  });

  it("labels units", () => {
    expect(weightUnitLabel("metric")).toBe("kg");
    expect(weightUnitLabel("imperial")).toBe("lb");
  });
});
