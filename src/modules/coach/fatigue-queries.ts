import type { Database } from "@/db/types";
import { isWorkingSet } from "@/modules/analytics/calc";
import { performanceByWorkout } from "@/modules/analytics/correlations";
import { lastWeeks, localDay, weekOf } from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";
import { last28Days, trainingLoad } from "@/modules/analytics/landmarks";
import { addDays } from "@/modules/history/schedule";
import { blockWeek } from "@/modules/programs/block";
import { activeProgram } from "@/modules/programs/programs";
import { checkinRange } from "@/modules/recovery/recovery";
import { assessFatigue } from "./fatigue";

/** Gathers the last 12 weeks of training, check-ins and the current block, and assesses fatigue. */
export async function fatigueFor(db: Database, userId: string, timeZone: string, now = new Date()) {
  const today = localDay(now, timeZone);
  const weeks = lastWeeks(today, 12);
  const from = new Date(Date.parse(`${weeks[0]}T00:00:00Z`) - 86400000);
  const [{ sets }, checkins, program] = await Promise.all([
    insightData(db, userId, from),
    checkinRange(db, userId, addDays(today, -27), today),
    activeProgram(db, userId),
  ]);
  const withDay = sets.map((s) => ({ ...s, day: localDay(s.startedAt, timeZone) }));
  const work = withDay.filter(isWorkingSet);
  const perWeek = new Map(weeks.map((w) => [w, 0]));
  for (const s of work) {
    const w = weekOf(s.day);
    if (perWeek.has(w)) perWeek.set(w, perWeek.get(w)! + 1);
  }
  const load = trainingLoad(
    last28Days(
      work.map((s) => s.day),
      today,
    ),
  );
  const block = program && blockWeek(program, today);
  return assessFatigue({
    loadRatio: load.ratio,
    monotony: load.acute ? load.monotony : null,
    recentPerformance: performanceByWorkout(withDay)
      .slice(-4)
      .map((p) => p.score),
    weeklySets: weeks.map((w) => perWeek.get(w)!),
    checkins,
    today,
    inDeload: block?.status === "active" && block.kind === "deload",
  });
}
