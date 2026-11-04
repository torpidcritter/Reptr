import { displayWeight, weightUnitLabel, type UnitSystem } from "./units";

export function formatDate(d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...opts,
  }).format(d);
}

export function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** Volume in the user's units, rounded for display (e.g. "4,250 kg"). */
export function formatVolume(kg: number, units: UnitSystem) {
  return `${Math.round(displayWeight(kg, units, 0)).toLocaleString("en")} ${weightUnitLabel(units)}`;
}
