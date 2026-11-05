// Pure maths for goal progress and forecasts. Forecasts are straight-line projections of
// recent data, labelled with how much data they rest on; they're estimates, not promises.

export type Confidence = "low" | "medium" | "high";
export type Point = { day: string; value: number };

const dayMs = 86400000;
const toDays = (day: string) => Date.parse(`${day}T00:00:00Z`) / dayMs;
const fromDays = (d: number) => new Date(Math.round(d) * dayMs).toISOString().slice(0, 10);

/** Least-squares line through the points: change per day, and how well it fits (r²). */
export function linearFit(points: Point[]) {
  const n = points.length;
  if (n < 2) return null;
  const xs = points.map((p) => toDays(p.day));
  const ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slopePerDay: slope, intercept: my - slope * mx, r2, n };
}

/** Share of the way from start to target, 0–100. Works for goals going up or down. */
export function progressPercent(start: number | null, current: number | null, target: number) {
  if (current == null) return 0;
  if (start == null || start === target) return current >= target ? 100 : 0;
  const p = ((current - start) / (target - start)) * 100;
  return Math.round(Math.min(100, Math.max(0, p)));
}

export type Forecast =
  | { status: "reached" }
  | { status: "on_track"; eta: string; confidence: Confidence; basis: string }
  | { status: "not_moving"; basis: string }
  | { status: "not_enough_data"; basis: string };

function confidenceOf(n: number, r2: number): Confidence {
  if (n >= 8 && r2 >= 0.6) return "high";
  if (n >= 5 && r2 >= 0.3) return "medium";
  return "low";
}

/**
 * When an estimated 1RM reaches the target if recent progress continues. `sessions` are
 * the best e1RM per session, oldest first; only the last 90 days count.
 */
export function forecastStrength(
  sessions: Point[],
  target: number,
  today: string,
  best: number | null,
): Forecast {
  if (best != null && best >= target) return { status: "reached" };
  const recent = sessions.filter((p) => toDays(today) - toDays(p.day) <= 90);
  if (recent.length < 4) {
    return {
      status: "not_enough_data",
      basis: `${recent.length} session${recent.length === 1 ? "" : "s"} in the last 90 days; a forecast needs 4`,
    };
  }
  const fit = linearFit(recent)!;
  const basis = `${recent.length} sessions over the last 90 days`;
  if (!fit || fit.slopePerDay <= 0) return { status: "not_moving", basis };
  const daysFromNow =
    (target - (fit.intercept + fit.slopePerDay * toDays(today))) / fit.slopePerDay;
  // Beyond two years a straight line means nothing.
  if (daysFromNow > 730) return { status: "not_moving", basis };
  return {
    status: "on_track",
    eta: fromDays(toDays(today) + Math.max(1, daysFromNow)),
    confidence: confidenceOf(fit.n, fit.r2),
    basis,
  };
}

/**
 * When the body-weight trend reaches the target at its current weekly rate.
 * `readings` is how many weigh-ins the rate is based on.
 */
export function forecastBodyweight(
  current: number | null,
  weeklyRate: number | null,
  target: number,
  today: string,
  readings: number,
): Forecast {
  if (current == null || readings < 2) {
    return { status: "not_enough_data", basis: "Log a few weigh-ins to see a trend" };
  }
  const direction = Math.sign(target - current);
  if (direction === 0 || Math.abs(target - current) < 0.1) return { status: "reached" };
  const basis = `the trend of ${readings} weigh-ins over the last 4 weeks`;
  if (weeklyRate == null) return { status: "not_enough_data", basis };
  if (Math.sign(weeklyRate) !== direction || Math.abs(weeklyRate) < 0.05) {
    return { status: "not_moving", basis };
  }
  const weeks = (target - current) / weeklyRate;
  if (weeks > 104) return { status: "not_moving", basis };
  return {
    status: "on_track",
    eta: fromDays(toDays(today) + weeks * 7),
    confidence: readings >= 12 ? "high" : readings >= 6 ? "medium" : "low",
    basis,
  };
}

/** For a workouts-per-week goal: weeks hit out of the recent ones, and the current run. */
export function consistency(perWeek: number[], target: number) {
  const hit = perWeek.map((n) => n >= target);
  // This week is still going, so a miss there doesn't break the run yet.
  const counted = hit.length && !hit[hit.length - 1] ? hit.slice(0, -1) : hit;
  let streak = 0;
  for (let i = counted.length - 1; i >= 0 && counted[i]; i--) streak++;
  const complete = perWeek.slice(0, -1);
  return {
    weeksHit: complete.filter((n) => n >= target).length,
    weeks: complete.length,
    streak,
    thisWeek: perWeek[perWeek.length - 1] ?? 0,
  };
}
