// What tends to go with better sessions. Each workout gets a performance score (how its
// estimated 1RMs compare with the same exercises' recent sessions), which is then compared
// with daily factors like sleep. These are associations in your own data, not causes.

import { e1rm, isWorkingSet, type CalcSet } from "./calc";

export type PerfSet = CalcSet & { workoutId: string; day: string; exerciseId: string };
export type Performance = { workoutId: string; day: string; score: number };

/**
 * Per workout and exercise: the session's best e1RM against the mean of that exercise's
 * previous three sessions, in percent. An exercise needs two earlier sessions to count.
 */
export function performanceDetail(sets: PerfSet[]) {
  // exercise -> sessions in order, each with its best e1RM
  const byExercise = new Map<string, { workoutId: string; day: string; best: number }[]>();
  const sorted = [...sets].sort((a, b) => a.day.localeCompare(b.day));
  for (const s of sorted) {
    if (!isWorkingSet(s)) continue;
    const est = e1rm(s.weightKg, s.reps);
    if (est == null) continue;
    const list = byExercise.get(s.exerciseId) ?? [];
    const last = list.at(-1);
    if (last?.workoutId === s.workoutId) last.best = Math.max(last.best, est);
    else list.push({ workoutId: s.workoutId, day: s.day, best: est });
    byExercise.set(s.exerciseId, list);
  }
  const out = new Map<string, { day: string; exercises: { exerciseId: string; pct: number }[] }>();
  for (const [exerciseId, list] of byExercise) {
    list.forEach((cur, i) => {
      if (i < 2) return;
      const prev = list.slice(Math.max(0, i - 3), i);
      const base = prev.reduce((a, p) => a + p.best, 0) / prev.length;
      const w = out.get(cur.workoutId) ?? { day: cur.day, exercises: [] };
      w.exercises.push({ exerciseId, pct: (cur.best / base - 1) * 100 });
      out.set(cur.workoutId, w);
    });
  }
  return out;
}

/** Per workout: the average of its exercises' scores from `performanceDetail`. */
export function performanceByWorkout(sets: PerfSet[]): Performance[] {
  return [...performanceDetail(sets)]
    .map(([workoutId, w]) => ({
      workoutId,
      day: w.day,
      score: w.exercises.reduce((a, e) => a + e.pct, 0) / w.exercises.length,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export type Factor = {
  key: string;
  label: string;
  /** How to describe the higher group, given the split point. */
  high: (split: number) => string;
  valueFor: (day: string) => number | null;
};

export const minSessions = 8;

export function strengthOf(r: number) {
  const a = Math.abs(r);
  return a < 0.2 ? "no clear" : a < 0.4 ? "weak" : a < 0.6 ? "moderate" : "strong";
}

/** For each factor with enough paired days: the correlation and the gap between halves. */
export function factorEffects(perf: Performance[], factors: Factor[]) {
  return factors
    .map((f) => {
      const pairs = perf.flatMap((p) => {
        const v = f.valueFor(p.day);
        return v == null ? [] : [{ v, score: p.score }];
      });
      if (pairs.length < minSessions) return { key: f.key, label: f.label, n: pairs.length };
      const values = pairs.map((p) => p.v).sort((a, b) => a - b);
      const split = values[Math.floor(values.length / 2)];
      const hi = pairs.filter((p) => p.v >= split);
      const lo = pairs.filter((p) => p.v < split);
      const mean = (xs: typeof pairs) => xs.reduce((a, p) => a + p.score, 0) / xs.length;
      const r = pearson(
        pairs.map((p) => p.v),
        pairs.map((p) => p.score),
      );
      if (r == null || !lo.length) return { key: f.key, label: f.label, n: pairs.length };
      return {
        key: f.key,
        label: f.label,
        n: pairs.length,
        r,
        strength: strengthOf(r),
        highLabel: f.high(split),
        gap: mean(hi) - mean(lo),
      };
    })
    .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
}
