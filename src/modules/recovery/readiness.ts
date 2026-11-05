// Readiness: a 0-100 read of how recovered the user is, from today's check-in and recent
// training load. It's a nudge for the day's session, not a medical measure.

export type Checkin = {
  sleepHours: number | null;
  sleepQuality: number | null; // 1-5, 5 = slept great
  energy: number | null; // 1-5, 5 = full of energy
  soreness: number | null; // 1-5, 5 = very sore
  stress: number | null; // 1-5, 5 = very stressed
  restingHr?: number | null;
  hrvMs?: number | null;
};

/** The user's usual resting HR and HRV (e.g. 28-day averages), to compare today against. */
export type Baseline = { restingHr: number | null; hrvMs: number | null };

export type Readiness = {
  score: number;
  level: "high" | "moderate" | "low";
  advice: string;
  factors: { label: string; effect: "helps" | "hurts" }[];
  /** How many inputs the score is based on; few inputs means a rough read. */
  inputs: number;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/**
 * Acute:chronic workload ratio: last 7 days' volume vs the weekly average of the last 28.
 * Around 0.8-1.3 is the usual range; well above means a sudden jump in training.
 */
export function loadRatio(last7: number, last28: number): number | null {
  const weekly = last28 / 4;
  if (weekly <= 0) return null;
  return Math.round((last7 / weekly) * 100) / 100;
}

export function readiness(
  c: Checkin | null,
  ratio: number | null,
  baseline?: Baseline,
): Readiness | null {
  const parts: { w: number; v: number; label: string }[] = [];
  if (c?.sleepHours != null)
    parts.push({ w: 3, v: clamp((c.sleepHours - 4.5) / 3.5), label: "Sleep length" });
  if (c?.sleepQuality != null)
    parts.push({ w: 2, v: (c.sleepQuality - 1) / 4, label: "Sleep quality" });
  if (c?.energy != null) parts.push({ w: 2, v: (c.energy - 1) / 4, label: "Energy" });
  if (c?.soreness != null) parts.push({ w: 2, v: (5 - c.soreness) / 4, label: "Soreness" });
  if (c?.stress != null) parts.push({ w: 1, v: (5 - c.stress) / 4, label: "Stress" });
  // Against your own baseline: HRV 20% under usual reads as poor, resting HR 5 bpm over too.
  if (c?.hrvMs != null && baseline?.hrvMs)
    parts.push({
      w: 2,
      v: clamp(0.5 + (c.hrvMs / baseline.hrvMs - 1) * 2.5),
      label: "HRV",
    });
  if (c?.restingHr != null && baseline?.restingHr)
    parts.push({
      w: 1,
      v: clamp(0.5 - (c.restingHr - baseline.restingHr) / 10),
      label: "Resting heart rate",
    });
  if (ratio != null)
    parts.push({ w: 2, v: clamp(1 - Math.max(0, ratio - 1.3) / 0.7), label: "Training load" });
  if (!parts.length) return null;

  const total = parts.reduce((n, p) => n + p.w, 0);
  const score = Math.round((parts.reduce((n, p) => n + p.w * p.v, 0) / total) * 100);
  const level = score >= 70 ? "high" : score >= 45 ? "moderate" : "low";
  const advice =
    level === "high"
      ? "Train as planned. A good day to push for a rep or a little more weight."
      : level === "moderate"
        ? "Train, but keep it honest: hit your planned sets and skip extra hard sets."
        : "Go light today: drop a set per exercise or do easy cardio and mobility instead.";
  const factors = parts
    .filter((p) => p.v >= 0.75 || p.v <= 0.35)
    .map((p) => ({
      label: p.label,
      effect: p.v >= 0.75 ? ("helps" as const) : ("hurts" as const),
    }));
  return { score, level, advice, factors, inputs: parts.length };
}

/** Average resting HR and HRV over earlier check-ins; each needs 5 readings to count. */
export function baselineFrom(
  earlier: { restingHr: number | null; hrvMs: number | null }[],
): Baseline {
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return {
    restingHr: avg(earlier.map((c) => c.restingHr)),
    hrvMs: avg(earlier.map((c) => c.hrvMs)),
  };
}
