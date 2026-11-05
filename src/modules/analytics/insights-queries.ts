import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  exerciseMuscles,
  exercises,
  muscleGroups,
  workoutExercises,
  workouts,
  workoutSets,
} from "@/db/schema";
import type { Database } from "@/db/types";
import type { InsightSet, MuscleLinkRow } from "./insights";
import { sessionStats } from "./progression";
import { mainLifts, type LiftBest } from "./ratios";
import { exerciseSessions } from "./records";

/** Completed sets since `from`, with the muscles each exercise trains. */
export async function insightData(db: Database, userId: string, from: Date) {
  const sets: InsightSet[] = await db
    .select({
      workoutId: workouts.id,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      exerciseId: workoutExercises.exerciseId,
      exercise: exercises.name,
      type: workoutSets.type,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceMeters: workoutSets.distanceMeters,
    })
    .from(workouts)
    .innerJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, "completed"),
        gte(workouts.startedAt, from),
      ),
    );

  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  const links: MuscleLinkRow[] = ids.length
    ? await db
        .select({
          exerciseId: exerciseMuscles.exerciseId,
          muscle: muscleGroups.slug,
          role: exerciseMuscles.role,
        })
        .from(exerciseMuscles)
        .innerJoin(muscleGroups, eq(muscleGroups.id, exerciseMuscles.muscleId))
        .where(inArray(exerciseMuscles.exerciseId, ids))
    : [];
  return { sets, links };
}

/** Best estimated 1RM in the last `days` days for each of the main barbell lifts. */
export async function mainLiftBests(db: Database, userId: string, days = 180) {
  const rows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(
      and(
        isNull(exercises.ownerId),
        inArray(
          exercises.slug,
          mainLifts.map((l) => l.slug),
        ),
      ),
    );
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return Promise.all(
    rows.map(async (r): Promise<LiftBest> => {
      const stats = (await exerciseSessions(db, userId, r.id, 60))
        .filter((s) => s.date >= since)
        .map(sessionStats);
      const values = stats.map((s) => s.bestE1rm).filter((v): v is number => v != null);
      return {
        slug: r.slug ?? "",
        exerciseId: r.id,
        e1rm: values.length ? Math.max(...values) : null,
      };
    }),
  );
}
