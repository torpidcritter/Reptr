import { and, asc, eq, exists, ilike, isNull, or, sql } from "drizzle-orm";
import { equipment, exerciseMuscles, exercises, muscleGroups } from "@/db/schema";
import type { Database } from "@/db/types";

export type ExerciseFilters = { q?: string; muscle?: string; equipment?: string };

/** Built-in exercises plus the user's own custom ones. */
const visibleTo = (userId: string) =>
  and(
    or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
    eq(exercises.isArchived, false),
  );

export async function listExercises(db: Database, userId: string, filters: ExerciseFilters = {}) {
  const conditions = [visibleTo(userId)];

  const q = filters.q?.trim();
  if (q) conditions.push(ilike(exercises.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`));

  if (filters.equipment) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(equipment)
          .where(
            and(eq(equipment.id, exercises.equipmentId), eq(equipment.slug, filters.equipment)),
          ),
      ),
    );
  }

  if (filters.muscle) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(exerciseMuscles)
          .innerJoin(muscleGroups, eq(muscleGroups.id, exerciseMuscles.muscleId))
          .where(
            and(
              eq(exerciseMuscles.exerciseId, exercises.id),
              eq(exerciseMuscles.role, "primary"),
              eq(muscleGroups.slug, filters.muscle),
            ),
          ),
      ),
    );
  }

  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      category: exercises.category,
      measurement: exercises.measurement,
      isCustom: sql<boolean>`${exercises.ownerId} is not null`,
      equipment: equipment.name,
      primaryMuscles: sql<string[]>`coalesce((
        select array_agg(mg.name order by em.contribution desc, mg.sort_order)
        from ${exerciseMuscles} em join ${muscleGroups} mg on mg.id = em.muscle_id
        where em.exercise_id = ${exercises.id} and em.role = 'primary'
      ), '{}')`,
    })
    .from(exercises)
    .leftJoin(equipment, eq(equipment.id, exercises.equipmentId))
    .where(and(...conditions))
    .orderBy(sql`lower(${exercises.name}) collate "C"`);
}

export async function getExercise(db: Database, userId: string, id: string) {
  const [exercise] = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      category: exercises.category,
      measurement: exercises.measurement,
      movementPattern: exercises.movementPattern,
      isUnilateral: exercises.isUnilateral,
      instructions: exercises.instructions,
      formCues: exercises.formCues,
      isCustom: sql<boolean>`${exercises.ownerId} is not null`,
      equipment: equipment.name,
    })
    .from(exercises)
    .leftJoin(equipment, eq(equipment.id, exercises.equipmentId))
    .where(and(eq(exercises.id, id), visibleTo(userId)))
    .limit(1);
  if (!exercise) return null;

  const muscles = await db
    .select({
      name: muscleGroups.name,
      role: exerciseMuscles.role,
      contribution: exerciseMuscles.contribution,
    })
    .from(exerciseMuscles)
    .innerJoin(muscleGroups, eq(muscleGroups.id, exerciseMuscles.muscleId))
    .where(eq(exerciseMuscles.exerciseId, id))
    .orderBy(sql`${exerciseMuscles.contribution} desc`, asc(muscleGroups.sortOrder));

  return { ...exercise, muscles };
}

export function listMuscleGroups(db: Database) {
  return db
    .select({ slug: muscleGroups.slug, name: muscleGroups.name })
    .from(muscleGroups)
    .orderBy(asc(muscleGroups.sortOrder));
}

export function listEquipment(db: Database) {
  return db
    .select({ slug: equipment.slug, name: equipment.name })
    .from(equipment)
    .orderBy(asc(equipment.name));
}
