import type { WorkoutSnapshot } from "./snapshot";

const WORK_SECONDS = 40; // a typical set, before any rest

/**
 * Roughly how long the rest of a workout will take, in seconds. Uses this session's own
 * pace once a few sets are done (the median gap between completed sets), otherwise
 * a typical set plus the planned rest. Returns null when nothing is left.
 */
export function estimateRemainingSeconds(w: WorkoutSnapshot, defaultRestSeconds: number) {
  let remaining = 0;
  let fallback = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (s.completedAt) continue;
      remaining += 1;
      fallback += WORK_SECONDS + (s.type === "warmup" ? 30 : (e.restSeconds ?? defaultRestSeconds));
    }
  }
  if (remaining === 0) return null;

  const times = w.exercises
    .flatMap((e) => e.sets.map((s) => s.completedAt))
    .filter((t): t is string => t != null)
    .map(Date.parse)
    .sort((a, b) => a - b);
  // Gaps over 15 minutes are interruptions, not pace.
  const gaps = times
    .slice(1)
    .map((t, i) => (t - times[i]) / 1000)
    .filter((g) => g > 0 && g < 900)
    .sort((a, b) => a - b);
  if (gaps.length < 3) return Math.round(fallback);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.round(remaining * Math.min(600, Math.max(30, median)));
}

/** Sets done against sets planned, and the share as a whole percentage. */
export function adherence(done: number, planned: number | null) {
  if (!planned || planned <= 0) return null;
  return { done, planned, percent: Math.round((Math.min(done, planned) / planned) * 100) };
}
