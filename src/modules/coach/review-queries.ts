import { and, desc, eq, gte, lt } from "drizzle-orm";
import { workouts } from "@/db/schema";
import type { Database } from "@/db/types";
import { performanceDetail } from "@/modules/analytics/correlations";
import { localDay } from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";
import { recordsForWorkout } from "@/modules/analytics/records";
import { previousComparable } from "@/modules/history/history";
import { adherence } from "@/modules/workouts/estimate";
import { summarize } from "@/modules/workouts/snapshot";
import { getWorkout } from "@/modules/workouts/workouts";
import { reviewSession } from "./review";

/** The rule-based review of one completed workout, or null if it isn't one. */
export async function sessionReviewFor(
  db: Database,
  userId: string,
  workoutId: string,
  timeZone: string,
) {
  const w = await getWorkout(db, userId, workoutId);
  if (!w || w.status !== "completed") return null;
  const start = new Date(w.startedAt);
  const [{ sets }, prs, prev] = await Promise.all([
    insightData(db, userId, new Date(start.getTime() - 200 * 86400000)),
    recordsForWorkout(db, userId, workoutId),
    previousComparable(db, userId, workoutId),
  ]);
  const detail = performanceDetail(
    sets.map((s) => ({ ...s, day: localDay(s.startedAt, timeZone) })),
  ).get(workoutId);
  const pctOf = new Map(detail?.exercises.map((e) => [e.exerciseId, e.pct]));
  const before = prev ? await getWorkout(db, userId, prev.id) : null;
  const stats = summarize(w);
  const prevVolume = before ? summarize(before).volumeKg : 0;
  const names = new Map(w.exercises.map((e) => [e.exerciseId, e.name]));
  const review = reviewSession({
    exercises: [...names].map(([id, name]) => ({ name, pct: pctOf.get(id) ?? null })),
    records: Object.values(prs).flat().length,
    volumeChange: prevVolume > 0 ? ((stats.volumeKg - prevVolume) / prevVolume) * 100 : null,
    plan: adherence(stats.sets, w.plannedSets),
    rpes: w.exercises.flatMap((e) =>
      e.sets
        .filter((s) => s.completedAt && s.type !== "warmup" && s.rpe != null)
        .map((s) => s.rpe!),
    ),
  });
  return {
    workout: { id: w.id, name: w.name, date: localDay(start, timeZone) },
    ...review,
    exercises: [...names].map(([id, name]) => ({
      name,
      vsRecentPct: pctOf.has(id) ? Math.round(pctOf.get(id)! * 10) / 10 : null,
    })),
  };
}

/** The latest completed workout on or before `day` (or overall), for the coach. */
export async function workoutOnOrBefore(db: Database, userId: string, day?: string) {
  const conditions = [eq(workouts.userId, userId), eq(workouts.status, "completed")];
  if (day) {
    conditions.push(
      lt(workouts.startedAt, new Date(Date.parse(`${day}T00:00:00Z`) + 86400000 + 14 * 3600000)),
    );
    conditions.push(
      gte(workouts.startedAt, new Date(Date.parse(`${day}T00:00:00Z`) - 60 * 86400000)),
    );
  }
  const [row] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(...conditions))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  return row?.id ?? null;
}
