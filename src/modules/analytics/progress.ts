// Turns training numbers into a few plain sentences for the Progress page. Each one is
// only said when there is enough data behind it.

type Point = { x: number; y: number };

/** How a lift's estimated max moved from its first to its latest session in the range. */
export function strengthChange(points: Point[]) {
  if (points.length < 2) return null;
  const first = points[0].y;
  const last = points[points.length - 1].y;
  const best = Math.max(...points.map((p) => p.y));
  const pct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
  return { first, last, best, pct, sessions: points.length };
}

/** "Your estimated Bench Press max is up 8% …" */
export function strengthSentence(name: string, c: NonNullable<ReturnType<typeof strengthChange>>) {
  if (c.pct >= 2) return `Your estimated ${name} max is up ${c.pct}% over ${c.sessions} sessions.`;
  if (c.pct <= -2)
    return `Your estimated ${name} max is down ${Math.abs(c.pct)}% over ${c.sessions} sessions. A lighter week or more sleep often turns this around.`;
  return `Your ${name} is holding steady over ${c.sessions} sessions.`;
}

/** Average workouts per week, counting only weeks since the first workout in the range. */
export function consistency(workoutsPerWeek: number[]) {
  const start = workoutsPerWeek.findIndex((n) => n > 0);
  if (start < 0) return null;
  const weeks = workoutsPerWeek.slice(start);
  const total = weeks.reduce((a, b) => a + b, 0);
  return {
    perWeek: Math.round((total / weeks.length) * 10) / 10,
    weeksTrained: weeks.filter((n) => n > 0).length,
    weeks: weeks.length,
    total,
  };
}

/** Which muscles got the most and the least work, in words. */
export function splitSentence(muscles: { name: string; avg: number }[]) {
  const worked = muscles.filter((m) => m.avg > 0);
  if (worked.length < 3) return null;
  const top = worked.slice(0, 2).map((m) => m.name);
  const low = worked
    .filter((m) => m.avg < 4)
    .slice(-2)
    .map((m) => m.name);
  return low.length
    ? `Most of your work went to ${top.join(" and ")}. ${low.join(" and ")} got the least, under 4 sets a week.`
    : `Most of your work went to ${top.join(" and ")}, and every trained muscle got at least 4 sets a week.`;
}
