/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Scheduled = { id: string; name: string; scheduleDays: number[] };

/** Which routines are planned on each weekday. */
export function plannedByWeekday(routines: Scheduled[]) {
  const out: { id: string; name: string }[][] = Array.from({ length: 7 }, () => []);
  for (const r of routines)
    for (const d of r.scheduleDays) out[d]?.push({ id: r.id, name: r.name });
  return out;
}

/** The YYYY-MM-DD dates from `from` to `to`, both included. */
export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * How well the plan was kept over some days: a planned day counts as done when any
 * workout was finished that day. Unplanned workouts are counted separately as extras.
 */
export function scheduleAdherence(
  dates: string[],
  plannedWeekdays: Set<number>,
  trainedDays: Set<string>,
) {
  let planned = 0;
  let done = 0;
  let extra = 0;
  const missed: string[] = [];
  for (const date of dates) {
    const isPlanned = plannedWeekdays.has(weekdayOf(date));
    const trained = trainedDays.has(date);
    if (isPlanned) {
      planned += 1;
      if (trained) done += 1;
      else missed.push(date);
    } else if (trained) extra += 1;
  }
  return {
    planned,
    done,
    extra,
    missed,
    percent: planned > 0 ? Math.round((done / planned) * 100) : null,
  };
}
