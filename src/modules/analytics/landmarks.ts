// Weekly set guides per muscle and training-load maths. The set ranges are rough,
// population-level starting points for hypertrophy (after Israetel et al.), not
// prescriptions: people differ, and the trend of your own progress matters more.

export type Landmarks = { mev: number; mavLow: number; mavHigh: number; mrv: number };

const L = (mev: number, mavLow: number, mavHigh: number, mrv: number): Landmarks => ({
  mev,
  mavLow,
  mavHigh,
  mrv,
});

const byMuscle: Record<string, Landmarks> = {
  chest: L(8, 12, 20, 22),
  "upper-chest": L(4, 6, 12, 16),
  "front-delts": L(0, 6, 8, 12),
  "side-delts": L(8, 16, 22, 26),
  "rear-delts": L(6, 12, 18, 22),
  lats: L(8, 12, 20, 25),
  "upper-back": L(8, 12, 20, 25),
  traps: L(0, 12, 20, 26),
  biceps: L(8, 14, 20, 26),
  triceps: L(6, 10, 14, 18),
  quads: L(8, 12, 18, 20),
  hamstrings: L(6, 10, 16, 20),
  glutes: L(0, 4, 12, 16),
  calves: L(8, 12, 16, 20),
  abs: L(0, 16, 20, 25),
};

export const landmarksFor = (muscle: string): Landmarks | null => byMuscle[muscle] ?? null;

/** Muscles worth flagging when they get little or no direct work. Glutes and abs are left
 * out: compound lifts train them enough that direct work is optional. */
export const majorMuscles = [
  "chest",
  "lats",
  "upper-back",
  "side-delts",
  "rear-delts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "calves",
];

export type LandmarkRead = {
  label: string;
  tone: "low" | "ok" | "high";
  landmarks: Landmarks | null;
};

/** Where an average weekly set count sits against the muscle's guide. */
export function landmarkRead(muscle: string, avgSets: number): LandmarkRead {
  const l = landmarksFor(muscle);
  if (!l) {
    // No guide for this muscle: fall back to the general 10–20 sets rule.
    if (avgSets < 10) return { label: "Below 10", tone: "low", landmarks: null };
    if (avgSets <= 20) return { label: "In range", tone: "ok", landmarks: null };
    return { label: "High", tone: "high", landmarks: null };
  }
  if (avgSets < l.mev) return { label: "Maintenance", tone: "low", landmarks: l };
  if (avgSets < l.mavLow) return { label: "Light", tone: "ok", landmarks: l };
  if (avgSets <= l.mavHigh) return { label: "Productive", tone: "ok", landmarks: l };
  if (avgSets <= l.mrv) return { label: "Near max", tone: "high", landmarks: l };
  return { label: "Above max", tone: "high", landmarks: l };
}

/** Major muscles averaging under two sets a week. */
export function neglectedMuscles(avgByMuscle: Map<string, number>) {
  return majorMuscles.filter((m) => (avgByMuscle.get(m) ?? 0) < 2);
}

/**
 * Training load from daily working-set counts over the last 28 days (oldest first,
 * today last). Monotony and strain follow Foster (1998); the acute:chronic ratio compares
 * this week with the four-week weekly average.
 */
export function trainingLoad(daily: number[]) {
  if (daily.length !== 28) throw new Error("trainingLoad needs 28 days");
  const week = daily.slice(-7);
  const acute = week.reduce((a, b) => a + b, 0);
  const chronic = daily.reduce((a, b) => a + b, 0) / 4;
  const mean = acute / 7;
  const sd = Math.sqrt(week.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
  // With no variation at all, monotony is unbounded; cap it so it reads as "very high".
  const monotony = acute === 0 ? 0 : sd === 0 ? 10 : mean / sd;
  const ratio = chronic > 0 ? acute / chronic : null;
  return {
    acute,
    chronic,
    ratio,
    monotony,
    strain: acute * monotony,
    read:
      ratio == null
        ? ("not_enough" as const)
        : ratio > 1.5
          ? ("spike" as const)
          : ratio < 0.6
            ? ("drop" as const)
            : ("steady" as const),
    monotonous: monotony > 2,
  };
}

/** Counts per day for the 28 days ending `today`, oldest first, from one day per set. */
export function last28Days(setDays: string[], today: string) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const out = Array<number>(28).fill(0);
  for (const d of setDays) {
    const ago = Math.round((end - Date.parse(`${d}T00:00:00Z`)) / 86400000);
    if (ago >= 0 && ago < 28) out[27 - ago]++;
  }
  return out;
}
