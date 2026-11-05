// Pure maths for body-weight trends. Daily weight swings 1-2 kg with water and food, so
// progress is read from a smoothed trend, not from any single weigh-in.

export type Reading = { day: string; value: number };

/** One reading per day (the average of that day's weigh-ins), oldest first. */
export function dailyReadings(rows: { day: string; value: number }[]): Reading[] {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.day, [...(by.get(r.day) ?? []), r.value]);
  return [...by]
    .map(([day, v]) => ({ day, value: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

const dayMs = 86400000;
const t = (day: string) => Date.parse(`${day}T00:00:00Z`);

/**
 * Exponentially weighted trend with a ~10-day half-life-style smoothing. Gaps between
 * weigh-ins count as that many days, so a week off doesn't make one reading jump the trend.
 */
export function trendLine(readings: Reading[], alpha = 0.1): Reading[] {
  const out: Reading[] = [];
  let prev: Reading | null = null;
  for (const r of readings) {
    if (!prev) {
      prev = { ...r };
    } else {
      const gap = Math.max(1, Math.round((t(r.day) - t(prev.day)) / dayMs));
      const a = 1 - (1 - alpha) ** gap;
      prev = { day: r.day, value: prev.value + a * (r.value - prev.value) };
    }
    out.push({ day: prev.day, value: Math.round(prev.value * 100) / 100 });
  }
  return out;
}

/** Change in trend weight per week over the last `days` days (least-squares slope). */
export function weeklyRate(trend: Reading[], days = 28): number | null {
  if (trend.length < 2) return null;
  const end = t(trend[trend.length - 1].day);
  const pts = trend.filter((r) => end - t(r.day) <= days * dayMs);
  if (pts.length < 2 || t(pts[pts.length - 1].day) - t(pts[0].day) < 6 * dayMs) return null;
  const xs = pts.map((p) => (t(p.day) - end) / dayMs);
  const ys = pts.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den ? Math.round((num / den) * 7 * 100) / 100 : null;
}

/**
 * How much the latest reading differs from the one `days` or more before it. Null when
 * there's no reading that far back, so a change is never made up from too little data.
 */
export function changeOver(readings: Reading[], days: number): number | null {
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  const cutoff = Date.parse(`${last.day}T00:00:00Z`) - days * 86400000;
  const before = readings.filter((r) => Date.parse(`${r.day}T00:00:00Z`) <= cutoff).at(-1);
  return before ? Math.round((last.value - before.value) * 100) / 100 : null;
}
