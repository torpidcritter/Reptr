// A month-by-month story of training: what was done, what was new and what changed.

export type TimelineInput = {
  workouts: { day: string; volumeKg: number; minutes: number | null }[];
  records: { day: string }[];
  firsts: { day: string; name: string }[];
  /** Body-weight trend, oldest first. */
  weights: { day: string; value: number }[];
  milestones: { reachedOn: string | null; title: string }[];
};

export type TimelineMonth = {
  month: string;
  workouts: number;
  volumeKg: number;
  minutes: number;
  records: number;
  firsts: string[];
  weight: { start: number; end: number } | null;
  milestones: string[];
};

const monthOf = (day: string) => day.slice(0, 7);

/** Months with any activity, newest first. */
export function monthlyTimeline(input: TimelineInput): TimelineMonth[] {
  const months = new Map<string, TimelineMonth>();
  const get = (day: string) => {
    const key = monthOf(day);
    let m = months.get(key);
    if (!m) {
      m = {
        month: key,
        workouts: 0,
        volumeKg: 0,
        minutes: 0,
        records: 0,
        firsts: [],
        weight: null,
        milestones: [],
      };
      months.set(key, m);
    }
    return m;
  };
  for (const w of input.workouts) {
    const m = get(w.day);
    m.workouts++;
    m.volumeKg += w.volumeKg;
    m.minutes += w.minutes ?? 0;
  }
  for (const r of input.records) get(r.day).records++;
  for (const f of input.firsts) get(f.day).firsts.push(f.name);
  for (const ms of input.milestones) if (ms.reachedOn) get(ms.reachedOn).milestones.push(ms.title);
  // Weight only annotates months that already have something in them.
  for (const w of input.weights) {
    const m = months.get(monthOf(w.day));
    if (!m) continue;
    m.weight = m.weight ? { ...m.weight, end: w.value } : { start: w.value, end: w.value };
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
