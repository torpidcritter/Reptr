import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { exercises, routineExercises, routines } from "@/db/schema";
import type { Database } from "@/db/types";

const int = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(min).max(max).nullable(),
  );

export const routineItemSchema = z
  .object({
    exerciseId: z.uuid(),
    targetSets: int(1, 20),
    targetRepsMin: int(1, 100),
    targetRepsMax: int(1, 100),
    restSeconds: int(0, 1800),
    /** Exercises sharing a number are done back to back as a superset. */
    supersetGroup: int(1, 50),
    notes: z.string().trim().max(500).nullish(),
  })
  .refine(
    (v) => v.targetRepsMin == null || v.targetRepsMax == null || v.targetRepsMin <= v.targetRepsMax,
    { message: "The rep range is back to front.", path: ["targetRepsMax"] },
  );

export const routineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the routine a name.")
    .max(60, "Keep it under 60 characters."),
  notes: z.string().trim().max(1000).nullish(),
  items: z.array(routineItemSchema).min(1, "Add at least one exercise.").max(40),
});

export type RoutineInput = z.infer<typeof routineSchema>;

export class RoutineNotFoundError extends Error {}

export async function listRoutines(db: Database, userId: string) {
  return db
    .select({
      id: routines.id,
      name: routines.name,
      updatedAt: routines.updatedAt,
      exerciseCount: sql<number>`(select count(*)::int from ${routineExercises} re where re.routine_id = "routines"."id")`,
      exerciseNames: sql<string[]>`coalesce((
        select array_agg(e.name order by re.position)
        from ${routineExercises} re join ${exercises} e on e.id = re.exercise_id
        where re.routine_id = "routines"."id"
      ), '{}')`,
    })
    .from(routines)
    .where(and(eq(routines.userId, userId), isNull(routines.archivedAt)))
    .orderBy(desc(routines.updatedAt));
}

export async function getRoutine(db: Database, userId: string, id: string) {
  const [routine] = await db
    .select({ id: routines.id, name: routines.name, notes: routines.notes })
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId), isNull(routines.archivedAt)));
  if (!routine) return null;

  const items = await db
    .select({
      exerciseId: routineExercises.exerciseId,
      exerciseName: exercises.name,
      measurement: exercises.measurement,
      targetSets: routineExercises.targetSets,
      targetRepsMin: routineExercises.targetRepsMin,
      targetRepsMax: routineExercises.targetRepsMax,
      restSeconds: routineExercises.restSeconds,
      supersetGroup: routineExercises.supersetGroup,
      notes: routineExercises.notes,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineId, id))
    .orderBy(asc(routineExercises.position));

  return { ...routine, items };
}

/** Creates a routine, or replaces an existing one's contents. Past workouts are never touched. */
export async function saveRoutine(
  db: Database,
  userId: string,
  input: RoutineInput,
  routineId?: string,
) {
  // Only exercises the user can see: built-ins and their own.
  const ids = [...new Set(input.items.map((i) => i.exerciseId))];
  const allowed = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(inArray(exercises.id, ids), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))),
    );
  if (allowed.length !== ids.length) throw new RoutineNotFoundError("Unknown exercise");

  return db.transaction(async (tx) => {
    let id = routineId;
    if (id) {
      const updated = await tx
        .update(routines)
        .set({ name: input.name, notes: input.notes ?? null })
        .where(and(eq(routines.id, id), eq(routines.userId, userId), isNull(routines.archivedAt)))
        .returning({ id: routines.id });
      if (updated.length === 0) throw new RoutineNotFoundError("Routine not found");
      await tx.delete(routineExercises).where(eq(routineExercises.routineId, id));
    } else {
      [{ id }] = await tx
        .insert(routines)
        .values({ userId, name: input.name, notes: input.notes ?? null })
        .returning({ id: routines.id });
    }

    await tx.insert(routineExercises).values(
      input.items.map((item, i) => ({
        userId,
        routineId: id!,
        exerciseId: item.exerciseId,
        position: i + 1,
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
        restSeconds: item.restSeconds,
        supersetGroup: item.supersetGroup,
        notes: item.notes ?? null,
      })),
    );
    return { id: id! };
  });
}

/** Hides a routine. It's kept so workouts started from it still link back. */
export async function archiveRoutine(db: Database, userId: string, id: string) {
  await db
    .update(routines)
    .set({ archivedAt: new Date() })
    .where(and(eq(routines.id, id), eq(routines.userId, userId)));
}

export async function duplicateRoutine(db: Database, userId: string, id: string) {
  const routine = await getRoutine(db, userId, id);
  if (!routine) throw new RoutineNotFoundError("Routine not found");
  return saveRoutine(db, userId, {
    name: `${routine.name} (copy)`.slice(0, 60),
    notes: routine.notes,
    items: routine.items,
  });
}
