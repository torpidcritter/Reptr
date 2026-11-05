// A short, rule-based review of one finished session: what went well and what to watch.
// The coach can expand on it, but these points come straight from the numbers.

export type ReviewInput = {
  exercises: { name: string; pct: number | null }[];
  records: number;
  /** Volume change against the previous comparable workout, in percent. */
  volumeChange: number | null;
  plan: { planned: number; done: number; percent: number } | null;
  /** RPE of working sets that had one. */
  rpes: number[];
};

export type ReviewPoint = { tone: "good" | "watch" | "info"; text: string; kind?: "records" };

const pct = (n: number) => `${Math.abs(n).toFixed(1).replace(/\.0$/, "")}%`;

export function reviewSession(input: ReviewInput) {
  const scored = input.exercises.filter((e): e is { name: string; pct: number } => e.pct != null);
  const overall = scored.length ? scored.reduce((a, e) => a + e.pct, 0) / scored.length : null;
  const points: ReviewPoint[] = [];

  if (input.records > 0)
    points.push({
      tone: "good",
      kind: "records",
      text: `${input.records} personal record${input.records === 1 ? "" : "s"}.`,
    });
  const best = [...scored].sort((a, b) => b.pct - a.pct)[0];
  if (best && best.pct >= 1)
    points.push({ tone: "good", text: `${best.name} up ${pct(best.pct)} on your recent level.` });
  for (const e of scored.filter((x) => x.pct <= -3))
    points.push({
      tone: "watch",
      text: `${e.name} down ${pct(e.pct)} on your recent level. One off day is normal; if it repeats, look at sleep, food and recent load.`,
    });
  if (input.volumeChange != null && Math.abs(input.volumeChange) >= 5)
    points.push({
      tone: "info",
      text: `Volume ${input.volumeChange > 0 ? "up" : "down"} ${pct(input.volumeChange)} on last time.`,
    });
  if (input.plan && input.plan.percent < 80)
    points.push({
      tone: "watch",
      text: `You did ${input.plan.done} of ${input.plan.planned} planned sets.`,
    });
  if (input.rpes.length >= 3) {
    const avg = input.rpes.reduce((a, b) => a + b, 0) / input.rpes.length;
    if (avg >= 9.5)
      points.push({
        tone: "watch",
        text: `Most sets were at RPE ${avg.toFixed(1)}, very close to failure. Fine now and then; leaving a rep in the tank helps recovery.`,
      });
    else if (avg <= 6.5)
      points.push({
        tone: "info",
        text: `Sets felt easy (average RPE ${avg.toFixed(1)}). There's room to add weight next time.`,
      });
  }

  const headline =
    input.records > 0
      ? "A record-setting session"
      : overall == null
        ? "Session logged"
        : overall >= 1
          ? "Stronger than your recent sessions"
          : overall <= -2
            ? "A tougher day than usual"
            : "In line with your recent sessions";
  const basis = scored.length
    ? `Compared with your previous sessions of ${scored.length} exercise${scored.length === 1 ? "" : "s"}.`
    : "Log the same exercises a few more times to compare sessions.";
  return { headline, overall, points, basis };
}
