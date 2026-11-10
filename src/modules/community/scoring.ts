// The parts of scoring that live in the app: which boards exist, what a period means,
// and how XP turns into a level. The numbers themselves are computed in the database
// (migration 0029); docs/social/LEADERBOARDS.md documents both halves.

export const categories = {
  workouts: { label: "Workouts", unit: "" },
  volume: { label: "Volume", unit: "kg" },
  sets: { label: "Working sets", unit: "" },
  minutes: { label: "Training time", unit: "min" },
  xp: { label: "XP", unit: "XP" },
  streak: { label: "Weekly streak", unit: "wk" },
} as const;
export type BaseCategory = keyof typeof categories;
export const isBaseCategory = (c: string): c is BaseCategory => c in categories;

/** Exercise boards: best estimated 1RM on a few lifts everyone does the same way. */
export const exerciseBoardSlugs = [
  "barbell-bench-press",
  "barbell-back-squat",
  "deadlift",
  "overhead-press",
] as const;

export const periods = ["week", "month", "all"] as const;
export type Period = (typeof periods)[number];
export const periodLabels: Record<Period, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

/**
 * A period's bounds, in UTC so everyone on a board is measured over the same instants.
 * Weeks start on Monday. A streak ignores the period (it's always "current").
 */
export function periodRange(period: Period, now = new Date()) {
  if (period === "all") return { from: new Date(0), to: new Date(Date.UTC(9999, 0, 1)) };
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (period === "month") {
    return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
  }
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const from = new Date(Date.UTC(y, m, now.getUTCDate() - day));
  return { from, to: new Date(from.getTime() + 7 * 86400_000) };
}

/** XP needed to reach `level`: 0, 250, 750, 1500, 2500… (125 × n × (n − 1)). */
export const xpForLevel = (level: number) => 125 * level * (level - 1);

export function levelFor(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, intoLevel: xp - floor, forNext: next - floor, nextAt: next };
}

/** XP for one counted workout, matching public.fitness_workouts(). */
export function workoutXp(workingSets: number, records: number) {
  return 50 + Math.min(2 * workingSets, 50) + Math.min(10 * records, 50);
}
