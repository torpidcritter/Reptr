import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { exercises, goals, workoutExercises, workouts } from "@/db/schema";
import type { Database } from "@/db/types";
import { lastWeeks, localDay, weekOf } from "@/modules/analytics/insights";
import { sessionStats } from "@/modules/analytics/progression";
import { exerciseSessions } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
import {
  consistency,
  forecastBodyweight,
  forecastStrength,
  progressPercent,
  type Forecast,
} from "./forecast";

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.iso.date().nullable(),
);

/** Values are in kg (strength, body weight) or workouts per week. Convert units before parsing. */
export const goalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("strength"),
    exerciseId: z.uuid("Pick an exercise."),
    targetValue: z.coerce.number().positive("Enter a target.").max(1000),
    targetDate: optionalDate,
  }),
  z.object({
    kind: z.literal("bodyweight"),
    targetValue: z.coerce.number().min(20, "Enter a target weight.").max(400),
    targetDate: optionalDate,
  }),
  z.object({
    kind: z.literal("consistency"),
    targetValue: z.coerce.number().int().min(1, "At least once a week.").max(14),
    targetDate: optionalDate,
  }),
]);
export type GoalInput = z.infer<typeof goalSchema>;

export class GoalExerciseError extends Error {}

type Current = {
  current: number | null;
  forecast: Forecast | null;
  /** For consistency goals. */
  weeks?: ReturnType<typeof consistency>;
};

async function strengthNow(db: Database, userId: string, exerciseId: string, today: string) {
  const sessions = (await exerciseSessions(db, userId, exerciseId, 60)).map(sessionStats);
  const points = sessions
    .filter((s) => s.bestE1rm != null)
    .map((s) => ({ day: s.date.slice(0, 10), value: s.bestE1rm! }));
  const best = points.length ? Math.max(...points.map((p) => p.value)) : null;
  return { best, points, today };
}

/** Body-weight trend now, its weekly rate and how many weigh-ins the last 4 weeks hold. */
export async function bodyweightNow(db: Database, userId: string) {
  const since = new Date(Date.now() - 120 * 86400000);
  const rows = await metricSeries(db, userId, "weight", since);
  const trend = trendLine(dailyReadings(rows.map((r) => ({ day: r.day, value: r.value }))));
  const monthAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  return {
    current: trend.at(-1)?.value ?? null,
    rate: weeklyRate(trend),
    readings: trend.filter((r) => r.day >= monthAgo).length,
  };
}

async function workoutsPerWeek(db: Database, userId: string, timeZone: string, today: string) {
  const weeks = lastWeeks(today, 9);
  const since = new Date(Date.parse(`${weeks[0]}T00:00:00Z`) - 86400000);
  const rows = await db
    .select({ startedAt: workouts.startedAt })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        gte(workouts.startedAt, since),
      ),
    );
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const r of rows) {
    const w = weekOf(localDay(r.startedAt, timeZone));
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }
  return weeks.map((w) => counts.get(w)!);
}

/** Creates a goal, recording where things stand now as its starting point. */
export async function createGoal(db: Database, userId: string, input: GoalInput, timeZone: string) {
  const today = localDay(new Date(), timeZone);
  let startValue: number | null = null;
  let exerciseId: string | null = null;
  if (input.kind === "strength") {
    const [ok] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.id, input.exerciseId),
          or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        ),
      );
    if (!ok) throw new GoalExerciseError("Unknown exercise");
    exerciseId = input.exerciseId;
    startValue = (await strengthNow(db, userId, input.exerciseId, today)).best;
  } else if (input.kind === "bodyweight") {
    startValue = (await bodyweightNow(db, userId)).current;
  }
  const [row] = await db
    .insert(goals)
    .values({
      userId,
      kind: input.kind,
      exerciseId,
      targetValue: input.targetValue,
      startValue,
      targetDate: input.targetDate,
    })
    .returning({ id: goals.id });
  return row;
}

export async function archiveGoal(db: Database, userId: string, id: string) {
  await db
    .update(goals)
    .set({ archivedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
}

/** Active goals with where things stand now, progress and a forecast. */
export async function listGoals(db: Database, userId: string, timeZone: string) {
  const today = localDay(new Date(), timeZone);
  const rows = await db
    .select({
      id: goals.id,
      kind: goals.kind,
      exerciseId: goals.exerciseId,
      exerciseName: exercises.name,
      targetValue: goals.targetValue,
      startValue: goals.startValue,
      targetDate: goals.targetDate,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .leftJoin(exercises, eq(exercises.id, goals.exerciseId))
    .where(and(eq(goals.userId, userId), isNull(goals.archivedAt)))
    .orderBy(asc(goals.kind), desc(goals.createdAt));

  let body: Awaited<ReturnType<typeof bodyweightNow>> | null = null;
  let perWeek: number[] | null = null;

  return Promise.all(
    rows.map(async (g) => {
      let now: Current;
      if (g.kind === "strength") {
        const s = await strengthNow(db, userId, g.exerciseId!, today);
        now = {
          current: s.best,
          forecast: forecastStrength(s.points, g.targetValue, today, s.best),
        };
      } else if (g.kind === "bodyweight") {
        body ??= await bodyweightNow(db, userId);
        now = {
          current: body.current,
          forecast: forecastBodyweight(
            body.current,
            body.rate,
            g.targetValue,
            today,
            body.readings,
          ),
        };
      } else {
        perWeek ??= await workoutsPerWeek(db, userId, timeZone, today);
        const weeks = consistency(perWeek, g.targetValue);
        now = { current: weeks.thisWeek, forecast: null, weeks };
      }
      const progress =
        g.kind === "consistency"
          ? Math.round((now.weeks!.weeksHit / Math.max(1, now.weeks!.weeks)) * 100)
          : progressPercent(g.startValue, now.current, g.targetValue);
      // A target date that the forecast lands after is worth flagging.
      const behind =
        g.targetDate != null &&
        now.forecast?.status === "on_track" &&
        now.forecast.eta > g.targetDate;
      return { ...g, ...now, progress, behind };
    }),
  );
}

export type GoalView = Awaited<ReturnType<typeof listGoals>>[number];

/** Exercises the user has logged, most used first, for picking a strength goal. */
export async function loggedExercises(db: Database, userId: string) {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select e.id, e.name from ${workoutExercises} we
    join ${workouts} w on w.id = we.workout_id and w.status = 'completed'
    join ${exercises} e on e.id = we.exercise_id
    where we.user_id = ${userId} and e.measurement = 'weight_reps'
    group by e.id, e.name
    order by count(*) desc, e.name
    limit 60`);
  return [...rows];
}
