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

/** A personal record's value in the user's units. */
export function formatRecord(
  type:
    | "heaviest_weight"
    | "best_e1rm"
    | "most_reps"
    | "best_set_volume"
    | "longest_duration"
    | "longest_distance",
  value: number,
  units: UnitSystem,
) {
  switch (type) {
    case "heaviest_weight":
    case "best_e1rm":
      return `${displayWeight(value, units, 1)} ${weightUnitLabel(units)}`;
    case "best_set_volume":
      return formatVolume(value, units);
    case "most_reps":
      return `${value} reps`;
    case "longest_duration":
      return value < 60 ? `${value}s` : formatDuration(value * 1000);
    case "longest_distance":
      return units === "metric"
        ? `${(value / 1000).toFixed(2)} km`
        : `${(value / 1609.344).toFixed(2)} mi`;
  }
}
