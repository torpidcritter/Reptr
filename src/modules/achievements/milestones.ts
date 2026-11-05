// Milestones reached from training history: counts and totals crossing round numbers.
// Kept low-key on purpose: a date and a number, no points or badges to chase.

export type WorkoutPoint = { day: string; volumeKg: number };

export type Milestone = {
  key: string;
  title: string;
  /** YYYY-MM-DD it was reached, or null if not yet. */
  reachedOn: string | null;
  /** For the next one not yet reached: how far along, 0–100. */
  progress?: number;
};

const WORKOUTS = [1, 10, 25, 50, 100, 250, 500, 1000];
const TONNES = [1, 10, 50, 100, 250, 500, 1000];
const STREAK_WEEKS = [4, 8, 12, 26, 52];

function crossings(
  thresholds: number[],
  series: { day: string; total: number }[],
  key: string,
  title: (n: number) => string,
): Milestone[] {
  const out: Milestone[] = [];
  const last = series.at(-1)?.total ?? 0;
  for (const n of thresholds) {
    const hit = series.find((p) => p.total >= n);
    out.push({
      key: `${key}-${n}`,
      title: title(n),
      reachedOn: hit?.day ?? null,
      progress: hit ? undefined : Math.min(99, Math.floor((last / n) * 100)),
    });
  }
  // Everything reached, plus just the next one to aim for.
  const firstOpen = out.findIndex((m) => !m.reachedOn);
  return firstOpen < 0 ? out : out.slice(0, firstOpen + 1);
}

/** The longest run of consecutive weeks with a workout, and when each length was first reached. */
function streakSeries(weekStarts: string[]) {
  const weeks = [...new Set(weekStarts)].sort();
  const series: { day: string; total: number }[] = [];
  let run = 0;
  let best = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    const t = Date.parse(`${w}T00:00:00Z`);
    run = prev != null && t - prev === 7 * 86400000 ? run + 1 : 1;
    prev = t;
    if (run > best) {
      best = run;
      series.push({ day: w, total: best });
    }
  }
  return series;
}

/**
 * `workouts` are completed workouts oldest first; `weekOf` maps a day to its Monday.
 */
export function milestones(workouts: WorkoutPoint[], weekOf: (day: string) => string) {
  let count = 0;
  let volume = 0;
  const countSeries = workouts.map((w) => ({ day: w.day, total: ++count }));
  const volumeSeries = workouts.map((w) => ({ day: w.day, total: (volume += w.volumeKg) / 1000 }));
  return [
    ...crossings(WORKOUTS, countSeries, "workouts", (n) =>
      n === 1 ? "First workout" : `${n} workouts`,
    ),
    ...crossings(TONNES, volumeSeries, "volume", (n) => `${n.toLocaleString("en")} t lifted`),
    ...crossings(
      STREAK_WEEKS,
      streakSeries(workouts.map((w) => weekOf(w.day))),
      "streak",
      (n) => `${n} weeks in a row`,
    ),
  ];
}
