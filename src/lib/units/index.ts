// Reptr stores kg, metres and seconds. Convert only at the display boundary.

export type UnitSystem = "metric" | "imperial";

const LB_PER_KG = 2.20462262185;
const IN_PER_CM = 1 / 2.54;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function cmToIn(cm: number): number {
  return cm * IN_PER_CM;
}

export function inToCm(inches: number): number {
  return inches / IN_PER_CM;
}

/** Converts a stored kg value for display, rounded to `decimals` places. */
export function displayWeight(kg: number, system: UnitSystem, decimals = 1): number {
  const value = system === "metric" ? kg : kgToLb(kg);
  return round(value, decimals);
}

/** Converts a weight the user typed into kg for storage. */
export function toStoredWeight(value: number, system: UnitSystem): number {
  return system === "metric" ? value : lbToKg(value);
}

export function weightUnitLabel(system: UnitSystem): "kg" | "lb" {
  return system === "metric" ? "kg" : "lb";
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
