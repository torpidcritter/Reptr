import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { dailyCheckins, workoutExercises, workouts, workoutSets } from "@/db/schema";
import type { Database } from "@/db/types";
import { muscleSlugs } from "./muscle-map";

const score = z.number().int().min(1).max(5).nullable().default(null);

export const checkinSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepHours: z.number().min(0).max(24).nullable().default(null),
  sleepQuality: score,
  energy: score,
  soreness: score,
  stress: score,
  steps: z.number().int().min(0).max(200000).nullable().default(null),
  restingHr: z.number().int().min(25).max(200).nullable().default(null),
  hrvMs: z.number().int().min(5).max(300).nullable().default(null),
  soreMuscles: z
    .array(z.enum(muscleSlugs))
    .max(20)
    .default([])
    .transform((m) => [...new Set(m)]),
  notes: z.string().trim().max(1000).nullable().default(null),
});
export type CheckinInput = z.infer<typeof checkinSchema>;

/** Saves the day's check-in, replacing any earlier one for the same day. */
export async function saveCheckin(db: Database, userId: string, c: CheckinInput) {
  const { day, ...rest } = c;
  await db
    .insert(dailyCheckins)
    .values({ userId, day, ...rest })
    .onConflictDoUpdate({ target: [dailyCheckins.userId, dailyCheckins.day], set: rest });
}

export async function getCheckin(db: Database, userId: string, day: string) {
  const [row] = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.day, day)));
  return row ?? null;
}

export async function checkinRange(db: Database, userId: string, from: string, to: string) {
  return db
    .select()
    .from(dailyCheckins)
    .where(
      and(
        eq(dailyCheckins.userId, userId),
        gte(dailyCheckins.day, from),
        lte(dailyCheckins.day, to),
      ),
    )
    .orderBy(asc(dailyCheckins.day));
}

/** Working-set volume (kg × reps) of completed workouts since `from`, before `to`. */
export async function volumeBetween(db: Database, userId: string, from: Date, to: Date) {
  const [row] = await db
    .select({
      volume: sql<number>`coalesce(sum(${workoutSets.weightKg} * ${workoutSets.reps}), 0)::float`,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        gte(workouts.startedAt, from),
        lt(workouts.startedAt, to),
        sql`${workoutSets.type} <> 'warmup'`,
      ),
    );
  return row.volume;
}
