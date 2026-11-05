// Pure maths for the weekly nutrition report: averages against targets, calories burned and
// a maintenance estimate that learns from what was eaten and how the weight trend moved.
import { type Reading, weeklyRate } from "@/modules/body/trend";

export type DayIntake = { day: string; calories: number; proteinG: number };

/** Resistance training at a moderate effort, rests included (Compendium of Physical Activities). */
const LIFTING_MET = 3.5;
/** About 0.04 kcal per step for a 70 kg adult, scaled by body weight. */
const KCAL_PER_STEP_70KG = 0.04;
/** Energy in a kilogram of body-weight change, a mix of fat and lean tissue. */
const KCAL_PER_KG = 7700;

/** Rough calories burned by training and walking on one day. */
export function caloriesBurned(weightKg: number, trainingMinutes: number, steps: number | null) {
  const training = Math.round(LIFTING_MET * weightKg * (trainingMinutes / 60));
  const walking = Math.round((steps ?? 0) * KCAL_PER_STEP_70KG * (weightKg / 70));
  return { training, walking, total: training + walking };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Days under half the usual intake are most likely only partly logged, so they're left out. */
export function completeDays(intakes: DayIntake[]) {
  if (!intakes.length) return [];
  const usual = median(intakes.map((d) => d.calories));
  return intakes.filter((d) => d.calories >= usual * 0.5);
}

export type TdeeEstimate = {
  kcal: number;
  avgIntake: number;
  weeklyRateKg: number;
  days: number;
  confidence: "low" | "medium" | "high";
};

/**
 * Maintenance calories from the last 4 weeks: average intake, corrected by the weight trend.
 * Losing 0.5 kg a week means you ate about 550 kcal a day under maintenance. Needs at least
 * 14 well-logged days and a trend that spans a week or more.
 */
export function adaptiveTdee(intakes: DayIntake[], trend: Reading[]): TdeeEstimate | null {
  const days = completeDays(intakes);
  if (days.length < 14) return null;
  const rate = weeklyRate(trend, 28);
  if (rate == null) return null;
  const avgIntake = days.reduce((a, d) => a + d.calories, 0) / days.length;
  const kcal = Math.round((avgIntake - (rate * KCAL_PER_KG) / 7) / 10) * 10;
  const end = trend.at(-1)!.day;
  const monthAgo = new Date(Date.parse(`${end}T00:00:00Z`) - 28 * 86400000)
    .toISOString()
    .slice(0, 10);
  const weighIns = trend.filter((r) => r.day > monthAgo).length;
  const confidence =
    days.length >= 24 && weighIns >= 12
      ? "high"
      : days.length >= 20 && weighIns >= 6
        ? "medium"
        : "low";
  return {
    kcal,
    avgIntake: Math.round(avgIntake),
    weeklyRateKg: rate,
    days: days.length,
    confidence,
  };
}

/** The trend value on a day, or the last one before it. */
const trendOn = (trend: Reading[], day: string) =>
  trend.filter((r) => r.day <= day).at(-1)?.value ?? null;

export type WeekReport = ReturnType<typeof weeklyNutrition>;

/** One week: averages over logged days, days on target and the change in trend weight. */
export function weeklyNutrition(opts: {
  days: string[];
  intakes: DayIntake[];
  targets: { calories: number | null; proteinG: number | null } | null;
  trend: Reading[];
  burned: number[];
}) {
  const inWeek = opts.intakes.filter((d) => opts.days.includes(d.day));
  const n = inWeek.length;
  const avg = (f: (d: DayIntake) => number) =>
    n ? Math.round(inWeek.reduce((a, d) => a + f(d), 0) / n) : null;
  const cal = opts.targets?.calories ?? null;
  const pro = opts.targets?.proteinG ?? null;
  const first = opts.days[0];
  const last = opts.days[opts.days.length - 1];
  const dayBefore = new Date(Date.parse(`${first}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const start = trendOn(opts.trend, dayBefore);
  const end = trendOn(opts.trend, last);
  const weighIns = opts.trend.filter((r) => r.day >= first && r.day <= last).length;
  return {
    daysLogged: n,
    daysInWeek: opts.days.length,
    avgCalories: avg((d) => d.calories),
    avgProteinG: avg((d) => d.proteinG),
    caloriesOnTarget: cal
      ? inWeek.filter((d) => Math.abs(d.calories - cal) <= cal * 0.1).length
      : null,
    proteinOnTarget: pro ? inWeek.filter((d) => d.proteinG >= pro * 0.9).length : null,
    weightChangeKg:
      start != null && end != null && weighIns > 0 ? Math.round((end - start) * 100) / 100 : null,
    avgBurned: opts.burned.length
      ? Math.round(opts.burned.reduce((a, b) => a + b, 0) / opts.burned.length)
      : 0,
  };
}
