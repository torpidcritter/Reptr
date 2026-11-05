import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { Database } from "@/db";
import { workouts } from "@/db/schema";
import { localDay } from "@/modules/analytics/insights";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine } from "@/modules/body/trend";
import { checkinRange } from "@/modules/recovery/recovery";
import { dailyTotals, getTargets } from "./nutrition";
import { adaptiveTdee, caloriesBurned, weeklyNutrition } from "./report";

const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** The last 7 days ending today, with burn and a 4-week maintenance estimate. */
export async function nutritionReportFor(
  db: Database,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const today = localDay(now, timeZone);
  const days = Array.from({ length: 7 }, (_, i) => shift(today, i - 6));
  const since = new Date(now.getTime() - 9 * 86400000);
  const [intakes, targets, weights, checkins, sessions] = await Promise.all([
    dailyTotals(db, userId, shift(today, -27), today),
    getTargets(db, userId),
    metricSeries(db, userId, "weight", new Date(now.getTime() - 90 * 86400000)),
    checkinRange(db, userId, days[0], today),
    db
      .select({ startedAt: workouts.startedAt, finishedAt: workouts.finishedAt })
      .from(workouts)
      .where(
        and(
          eq(workouts.userId, userId),
          eq(workouts.status, "completed"),
          isNotNull(workouts.finishedAt),
          gte(workouts.startedAt, since),
        ),
      ),
  ]);
  const trend = trendLine(dailyReadings(weights.map((w) => ({ day: w.day, value: w.value }))));
  const weightKg = trend.at(-1)?.value ?? null;

  const minutes = new Map<string, number>();
  for (const s of sessions) {
    const d = localDay(s.startedAt, timeZone);
    // Cap a session at 3 hours, in case one was left open.
    const m = Math.min(180, (s.finishedAt!.getTime() - s.startedAt.getTime()) / 60000);
    minutes.set(d, (minutes.get(d) ?? 0) + m);
  }
  const steps = new Map(checkins.map((c) => [c.day, c.steps]));
  const burnByDay = weightKg
    ? days.map((d) => ({
        day: d,
        ...caloriesBurned(weightKg, minutes.get(d) ?? 0, steps.get(d) ?? null),
      }))
    : [];

  return {
    days,
    week: weeklyNutrition({
      days,
      intakes,
      targets,
      trend,
      burned: burnByDay.map((b) => b.total),
    }),
    burn: weightKg
      ? {
          training: burnByDay.reduce((a, b) => a + b.training, 0),
          walking: burnByDay.reduce((a, b) => a + b.walking, 0),
          stepDays: days.filter((d) => steps.get(d) != null).length,
        }
      : null,
    tdee: adaptiveTdee(intakes, trend),
    targets,
  };
}
