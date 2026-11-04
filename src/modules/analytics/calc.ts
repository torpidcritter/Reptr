// Pure training maths. Everything the charts, records and coach show comes from here,
// so the numbers are the same wherever they appear.

export type CalcSet = {
  type: "warmup" | "working" | "drop" | "failure";
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type RecordType =
  | "heaviest_weight"
  | "best_e1rm"
  | "most_reps"
  | "best_set_volume"
  | "longest_duration"
  | "longest_distance";

export const recordLabels: Record<RecordType, string> = {
  heaviest_weight: "Heaviest weight",
  best_e1rm: "Best estimated 1RM",
  most_reps: "Most reps",
  best_set_volume: "Best set volume",
  longest_duration: "Longest time",
  longest_distance: "Longest distance",
};

/** Warm-ups don't count towards volume, records or muscle sets. */
export const isWorkingSet = (s: Pick<CalcSet, "type">) => s.type !== "warmup";

/**
 * Estimated one-rep max with the Epley formula. A single is its own 1RM. Above 12 reps
 * the estimate gets unreliable, so those sets don't produce one.
 */
export function e1rm(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return round(weightKg * (1 + reps / 30), 1);
}

export function setVolume(s: Pick<CalcSet, "weightKg" | "reps">): number {
  return s.weightKg != null && s.reps != null ? s.weightKg * s.reps : 0;
}

export function totalVolume(sets: CalcSet[]): number {
  return sets.filter(isWorkingSet).reduce((sum, s) => sum + setVolume(s), 0);
}

/** The value a set scores for each record type it can count towards. */
export function recordValues(s: CalcSet): Partial<Record<RecordType, number>> {
  if (!isWorkingSet(s)) return {};
  const out: Partial<Record<RecordType, number>> = {};
  if (s.weightKg != null && s.weightKg > 0) out.heaviest_weight = s.weightKg;
  const est = e1rm(s.weightKg, s.reps);
  if (est != null) out.best_e1rm = est;
  // Reps only count as a record on their own for bodyweight work.
  if (s.reps != null && s.reps > 0 && !s.weightKg) out.most_reps = s.reps;
  const vol = setVolume(s);
  if (vol > 0) out.best_set_volume = vol;
  if (s.durationSeconds != null && s.durationSeconds > 0) out.longest_duration = s.durationSeconds;
  if (s.distanceMeters != null && s.distanceMeters > 0) out.longest_distance = s.distanceMeters;
  return out;
}

export type NewRecord<S> = { type: RecordType; value: number; previous: number | null; set: S };

/**
 * Which sets beat the existing bests. Within one workout only the best set per type
 * counts, and it has to beat the old best strictly; a first-ever value is a record too.
 */
export function findRecords<S extends CalcSet>(
  sets: S[],
  bests: Partial<Record<RecordType, number>>,
): NewRecord<S>[] {
  const top = new Map<RecordType, { value: number; set: S }>();
  for (const s of sets) {
    for (const [type, value] of Object.entries(recordValues(s)) as [RecordType, number][]) {
      const cur = top.get(type);
      if (!cur || value > cur.value) top.set(type, { value, set: s });
    }
  }
  const out: NewRecord<S>[] = [];
  for (const [type, { value, set }] of top) {
    const previous = bests[type] ?? null;
    if (previous == null || value > previous + 1e-9) out.push({ type, value, previous, set });
  }
  return out;
}

export type MuscleLink = { muscle: string; role: "primary" | "secondary" };

/** A secondary muscle gets half a set for every working set. */
export const secondaryWeight = 0.5;

/** Weighted working sets per muscle for a list of exercises with their sets. */
export function muscleSets(
  items: { muscles: MuscleLink[]; sets: Pick<CalcSet, "type">[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { muscles, sets } of items) {
    const n = sets.filter(isWorkingSet).length;
    if (!n) continue;
    for (const m of muscles) {
      out[m.muscle] = (out[m.muscle] ?? 0) + n * (m.role === "primary" ? 1 : secondaryWeight);
    }
  }
  return out;
}

export function round(n: number, digits = 0) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
