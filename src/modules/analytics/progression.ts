import { type CalcSet, e1rm, isWorkingSet, round, setVolume } from "./calc";

export type Session<S extends CalcSet = CalcSet> = { date: string; workoutId: string; sets: S[] };

export type SessionStats = {
  date: string;
  workoutId: string;
  bestE1rm: number | null;
  topWeight: number | null;
  bestReps: number | null;
  volume: number;
  bestDuration: number | null;
  bestDistance: number | null;
  workingSets: number;
};

export function sessionStats(s: Session): SessionStats {
  const work = s.sets.filter(isWorkingSet);
  const max = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null && x > 0);
    return v.length ? Math.max(...v) : null;
  };
  return {
    date: s.date,
    workoutId: s.workoutId,
    bestE1rm: max(work.map((x) => e1rm(x.weightKg, x.reps))),
    topWeight: max(work.map((x) => x.weightKg)),
    bestReps: max(work.map((x) => x.reps)),
    volume: work.reduce((n, x) => n + setVolume(x), 0),
    bestDuration: max(work.map((x) => x.durationSeconds)),
    bestDistance: max(work.map((x) => x.distanceMeters)),
    workingSets: work.length,
  };
}

export type Suggestion =
  | { kind: "add_weight"; weightKg: number; reps: number; reason: string }
  | { kind: "add_reps"; weightKg: number | null; reps: number; reason: string }
  | { kind: "start"; reason: string };

/**
 * Double progression: work up the rep range at a weight, and once every working set
 * at that weight reaches the top of the range, add weight and drop back to the bottom.
 */
export function suggestNext(
  last: CalcSet[] | undefined,
  opts: { repMin?: number; repMax?: number; incrementKg?: number; weighted?: boolean } = {},
): Suggestion {
  const { repMin = 8, repMax = 12, incrementKg = 2.5, weighted = true } = opts;
  const work = (last ?? []).filter(
    (s) => isWorkingSet(s) && s.type !== "drop" && s.type !== "rest_pause" && s.reps,
  );
  if (!work.length) return { kind: "start", reason: "Log this exercise once to get a target." };

  if (!weighted) {
    const best = Math.max(...work.map((s) => s.reps ?? 0));
    return {
      kind: "add_reps",
      weightKg: null,
      reps: best + 1,
      reason: `Last time your best set was ${best} reps. Aim for one more.`,
    };
  }

  const top = Math.max(...work.map((s) => s.weightKg ?? 0));
  const atTop = work.filter((s) => (s.weightKg ?? 0) === top);
  const fewest = Math.min(...atTop.map((s) => s.reps ?? 0));
  if (fewest >= repMax) {
    return {
      kind: "add_weight",
      weightKg: round(top + incrementKg, 2),
      reps: repMin,
      reason: `Every set at this weight reached ${repMax} reps, so it's time to go heavier.`,
    };
  }
  return {
    kind: "add_reps",
    weightKg: top,
    reps: Math.min(fewest + 1, repMax),
    reason: `Stay at this weight and add a rep to your weakest set (${fewest} last time).`,
  };
}

/**
 * Stalled when the last `window` sessions haven't beaten the best before them.
 * Needs at least window + 1 sessions with a value.
 */
export function isPlateau(values: (number | null)[], window = 3): boolean {
  const v = values.filter((x): x is number => x != null);
  if (v.length < window + 1) return false;
  const before = Math.max(...v.slice(0, -window));
  return Math.max(...v.slice(-window)) <= before;
}
