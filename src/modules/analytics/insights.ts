import { e1rm, isWorkingSet, type CalcSet, setVolume } from "./calc";

export const ranges = {
  "4w": { weeks: 4, label: "4 weeks" },
  "12w": { weeks: 12, label: "12 weeks" },
  "6m": { weeks: 26, label: "6 months" },
  "1y": { weeks: 52, label: "1 year" },
} as const;
export type RangeKey = keyof typeof ranges;
export const parseRange = (v: string | undefined): RangeKey =>
  v && v in ranges ? (v as RangeKey) : "12w";

/** The calendar day ("YYYY-MM-DD") of an instant in a time zone. */
export function localDay(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The Monday of the week containing `day`. */
export function weekOf(day: string) {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** The Mondays of the last `n` weeks, oldest first, ending with this week. */
export function lastWeeks(today: string, n: number) {
  const thisWeek = weekOf(today);
  return Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (n - 1 - i)));
}

export type InsightSet = CalcSet & {
  workoutId: string;
  startedAt: Date;
  finishedAt: Date | null;
  exerciseId: string;
  exercise: string;
};
export type MuscleLinkRow = { exerciseId: string; muscle: string; role: "primary" | "secondary" };

type Totals = { workouts: number; sets: number; volume: number; minutes: number };

/**
 * Everything the insights page shows, from the raw completed sets of the current period
 * and the one before it (for the change figures).
 */
export function buildInsights(
  sets: InsightSet[],
  links: MuscleLinkRow[],
  weeks: string[],
  timeZone: string,
) {
  const first = weeks[0];
  const prevFirst = addDays(first, -7 * weeks.length);
  const index = new Map(weeks.map((w, i) => [w, i]));
  const muscleOf = new Map<string, MuscleLinkRow[]>();
  for (const l of links) muscleOf.set(l.exerciseId, [...(muscleOf.get(l.exerciseId) ?? []), l]);

  const weekly = weeks.map((week) => ({ week, workouts: 0, sets: 0, volume: 0 }));
  const muscles: Record<string, number[]> = {};
  const cur = new Map<string, InsightSet>();
  const prev = new Map<string, InsightSet>();
  const curTotals: Totals = { workouts: 0, sets: 0, volume: 0, minutes: 0 };
  const prevTotals: Totals = { workouts: 0, sets: 0, volume: 0, minutes: 0 };
  // exercise -> workout -> best e1RM that session
  const lifts = new Map<
    string,
    { name: string; sessions: Map<string, { x: number; y: number }> }
  >();

  for (const s of sets) {
    const day = localDay(s.startedAt, timeZone);
    if (day < prevFirst) continue;
    const isCur = day >= first;
    const work = isWorkingSet(s);
    const t = isCur ? curTotals : prevTotals;
    const seen = isCur ? cur : prev;
    if (!seen.has(s.workoutId)) {
      seen.set(s.workoutId, s);
      t.workouts++;
      if (s.finishedAt) t.minutes += (s.finishedAt.getTime() - s.startedAt.getTime()) / 60000;
      if (isCur) weekly[index.get(weekOf(day))!].workouts++;
    }
    if (!work) continue;
    t.sets++;
    t.volume += setVolume(s);
    if (!isCur) continue;

    const wi = index.get(weekOf(day))!;
    weekly[wi].sets++;
    weekly[wi].volume += setVolume(s);
    for (const m of muscleOf.get(s.exerciseId) ?? []) {
      (muscles[m.muscle] ??= weeks.map(() => 0))[wi] += m.role === "primary" ? 1 : 0.5;
    }
    const est = e1rm(s.weightKg, s.reps);
    if (est != null) {
      const l = lifts.get(s.exerciseId) ?? { name: s.exercise, sessions: new Map() };
      const p = l.sessions.get(s.workoutId);
      if (!p || est > p.y) l.sessions.set(s.workoutId, { x: s.startedAt.getTime(), y: est });
      lifts.set(s.exerciseId, l);
    }
  }

  // Weeks so far, so the current part-week doesn't drag the average down unfairly.
  const muscleAvg = Object.entries(muscles)
    .map(([muscle, perWeek]) => ({
      muscle,
      perWeek,
      avg: perWeek.reduce((a, b) => a + b, 0) / weeks.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const topLifts = [...lifts]
    .map(([exerciseId, l]) => ({
      exerciseId,
      name: l.name,
      points: [...l.sessions.values()].sort((a, b) => a.x - b.x),
    }))
    .filter((l) => l.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 4);

  return { weekly, totals: curTotals, previous: prevTotals, muscleAvg, topLifts };
}

export type Insights = ReturnType<typeof buildInsights>;

/** A plain-language read of weekly sets for a muscle. */
export function volumeBand(avgSets: number) {
  if (avgSets < 4) return { label: "Very low", tone: "low" as const };
  if (avgSets < 10) return { label: "Below 10", tone: "low" as const };
  if (avgSets <= 20) return { label: "In range", tone: "ok" as const };
  return { label: "High", tone: "high" as const };
}
