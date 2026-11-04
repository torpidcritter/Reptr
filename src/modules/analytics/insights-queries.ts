import { and, eq, gte, inArray } from "drizzle-orm";
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
