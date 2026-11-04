/** Weeks (Monday first) covering a month, for a training calendar. Dates are YYYY-MM-DD. */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const weeks: { date: string; inMonth: boolean }[][] = [];
  const d = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (d.getUTCMonth() === month);
  return weeks;
}

/** Parses "2026-11" into a year and zero-based month, falling back to `now`. */
export function parseMonth(value: string | undefined, now = new Date()) {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (month >= 0 && month < 12 && year > 2000 && year < 2200) return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

export const monthKey = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, 1));
  return d.toISOString().slice(0, 7);
};
