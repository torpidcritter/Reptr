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
      commonMistakes: exercises.commonMistakes,
      safetyNotes: exercises.safetyNotes,
      difficulty: exercises.difficulty,
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

export type SimilarExercise = {
  id: string;
  name: string;
  measurement: (typeof exercises.$inferSelect)["measurement"];
  equipment: string | null;
  primaryMuscles: string[];
  /** Why it was picked, e.g. "Same muscles · same movement". */
  reason: string;
};

/**
 * Alternatives that keep the training intent of an exercise: they share its primary
 * muscles (weighted by how much each one works), ideally its movement pattern, and are
 * logged the same way. Ranked best first; never includes the exercise itself.
 */
export async function similarExercises(
  db: Database,
  userId: string,
  exerciseId: string,
  limit = 8,
): Promise<SimilarExercise[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    measurement: SimilarExercise["measurement"];
    equipment: string | null;
    primary_muscles: string[];
    muscle_overlap: number;
    same_pattern: boolean;
    same_measurement: boolean;
    same_equipment: boolean;
  }>(sql`
    with target as (
      select e.id, e.movement_pattern, e.measurement, e.equipment_id from ${exercises} e
      where e.id = ${exerciseId}
        and (e.owner_id is null or e.owner_id = ${userId})
    ),
    target_muscles as (
      select em.muscle_id, em.contribution from ${exerciseMuscles} em
      join target t on t.id = em.exercise_id
      where em.role = 'primary'
    ),
    scored as (
      select c.id,
        coalesce(sum(least(tm.contribution, em.contribution)), 0)::float as muscle_overlap
      from ${exercises} c
      join ${exerciseMuscles} em on em.exercise_id = c.id and em.role = 'primary'
      join target_muscles tm on tm.muscle_id = em.muscle_id
      where c.id <> ${exerciseId}
        and (c.owner_id is null or c.owner_id = ${userId})
        and not c.is_archived
      group by c.id
    )
    select c.id, c.name, c.measurement, eq.name as equipment,
      coalesce((
        select array_agg(mg.name order by em2.contribution desc, mg.sort_order)
        from ${exerciseMuscles} em2 join ${muscleGroups} mg on mg.id = em2.muscle_id
        where em2.exercise_id = c.id and em2.role = 'primary'
      ), '{}') as primary_muscles,
      s.muscle_overlap,
      (c.movement_pattern is not null and c.movement_pattern = t.movement_pattern) as same_pattern,
      (c.measurement = t.measurement) as same_measurement,
      (c.equipment_id is not distinct from t.equipment_id) as same_equipment
    from scored s
    join ${exercises} c on c.id = s.id
    left join ${equipment} eq on eq.id = c.equipment_id
    cross join target t
    order by
      s.muscle_overlap
        + case when c.movement_pattern = t.movement_pattern then 0.6 else 0 end
        + case when c.measurement = t.measurement then 0.3 else 0 end desc,
      lower(c.name)
    limit ${limit}
  `);

  return [...rows].map((r) => ({
    id: r.id,
    name: r.name,
    measurement: r.measurement,
    equipment: r.equipment,
    primaryMuscles: r.primary_muscles,
    reason: [
      r.muscle_overlap >= 0.75 ? "Same muscles" : "Overlapping muscles",
      r.same_pattern && "same movement",
      !r.same_equipment && r.equipment && `uses ${r.equipment.toLowerCase()}`,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}
