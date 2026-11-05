import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { workoutExercises, workouts, workoutSets, exercises } from "@/db/schema";
import type { Database } from "@/db/types";

/** Completed workouts, newest first, with simple totals. */
export async function listWorkoutHistory(
  db: Database,
  userId: string,
  opts: { from?: Date; to?: Date; limit?: number } = {},
) {
  const conditions = [eq(workouts.userId, userId), eq(workouts.status, "completed")];
  if (opts.from) conditions.push(gte(workouts.startedAt, opts.from));
  if (opts.to) conditions.push(lt(workouts.startedAt, opts.to));

  return db
    .select({
      id: workouts.id,
      name: workouts.name,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      setCount: sql<number>`(
        select count(*)::int from ${workoutSets} s
        join ${workoutExercises} we on we.id = s.workout_exercise_id
        where we.workout_id = "workouts"."id")`,
      volumeKg: sql<number>`(
        select coalesce(sum(s.weight_kg * s.reps), 0)::float from ${workoutSets} s
        join ${workoutExercises} we on we.id = s.workout_exercise_id
        join ${exercises} e on e.id = we.exercise_id
        where we.workout_id = "workouts"."id" and s.type <> 'warmup' and e.measurement = 'weight_reps')`,
      exerciseNames: sql<string[]>`coalesce((
        select array_agg(e.name order by we.position) from ${workoutExercises} we
        join ${exercises} e on e.id = we.exercise_id
        where we.workout_id = "workouts"."id"), '{}')`,
    })
    .from(workouts)
    .where(and(...conditions))
    .orderBy(desc(workouts.startedAt))
    .limit(opts.limit ?? 200);
}

/** Days in a month with a completed workout, as YYYY-MM-DD in the given time zone. */
export async function trainingDays(
  db: Database,
  userId: string,
  from: Date,
  to: Date,
  timeZone: string,
) {
  const rows = await db
    .selectDistinct({
      day: sql<string>`to_char(${workouts.startedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`,
    })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        gte(workouts.startedAt, from),
        lt(workouts.startedAt, to),
      ),
    );
  return rows.map((r) => r.day);
}

/**
 * The finished workout before this one that's most like it: from the same routine if
 * it came from one, otherwise with the same name.
 */
export async function previousComparable(db: Database, userId: string, workoutId: string) {
  const [w] = await db
    .select({ routineId: workouts.routineId, name: workouts.name, startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  if (!w) return null;
  const [prev] = await db
    .select({ id: workouts.id, startedAt: workouts.startedAt })
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        lt(workouts.startedAt, w.startedAt),
        w.routineId ? eq(workouts.routineId, w.routineId) : eq(workouts.name, w.name),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  return prev ?? null;
}

/** The first completed workout day each exercise appeared in, oldest first. */
export async function firstPerformances(db: Database, userId: string) {
  return db
    .select({
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      firstAt: sql<Date>`min(${workouts.startedAt})`.mapWith((v) => new Date(v)),
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workouts.userId, userId), eq(workouts.status, "completed")))
    .groupBy(workoutExercises.exerciseId, exercises.name)
    .orderBy(sql`min(${workouts.startedAt})`);
}
