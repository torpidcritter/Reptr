import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { equipment, exerciseMuscles, exercises, muscleGroups } from "@/db/schema";
import type { Database } from "@/db/types";

export const categories = [
  { value: "resistance", label: "Weights" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "stretching", label: "Stretching" },
  { value: "plyometrics", label: "Plyometrics" },
  { value: "functional", label: "Functional" },
] as const;

export const measurements = [
  { value: "weight_reps", label: "Weight and reps" },
  { value: "reps", label: "Reps only" },
  { value: "assisted_reps", label: "Assisted (weight helps you)" },
  { value: "time", label: "Time" },
  { value: "distance_time", label: "Distance and time" },
] as const;

export const customExerciseSchema = z
  .object({
    name: z.string().trim().min(2, "Give it a name.").max(80, "Keep the name under 80 characters."),
    category: z.enum(categories.map((c) => c.value)),
    measurement: z.enum(measurements.map((m) => m.value)),
    equipment: z.string().optional(),
    primaryMuscle: z.string().min(1, "Pick the main muscle it works."),
    secondaryMuscles: z.array(z.string()).default([]),
    isUnilateral: z.preprocess((v) => v === "on" || v === true, z.boolean()),
    formCues: z.string().trim().max(1000).optional(),
  })
  .transform((v) => ({
    ...v,
    equipment: v.equipment || null,
    formCues: v.formCues || null,
    secondaryMuscles: [...new Set(v.secondaryMuscles)].filter((m) => m !== v.primaryMuscle),
  }));

export type CustomExerciseInput = z.infer<typeof customExerciseSchema>;

export class DuplicateExerciseError extends Error {}

/** Creates a custom exercise owned by the user. Primary muscle counts fully; secondary ones count half. */
export async function createCustomExercise(
  db: Database,
  userId: string,
  input: CustomExerciseInput,
) {
  const [dupe] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        isNotNull(exercises.ownerId),
        eq(exercises.ownerId, userId),
        sql`lower(${exercises.name}) = lower(${input.name})`,
      ),
    );
  if (dupe) throw new DuplicateExerciseError("You already have an exercise with that name.");

  return db.transaction(async (tx) => {
    const [eq_] = input.equipment
      ? await tx
          .select({ id: equipment.id })
          .from(equipment)
          .where(eq(equipment.slug, input.equipment))
      : [];

    const [created] = await tx
      .insert(exercises)
      .values({
        ownerId: userId,
        name: input.name,
        category: input.category,
        measurement: input.measurement,
        equipmentId: eq_?.id ?? null,
        isUnilateral: input.isUnilateral,
        formCues: input.formCues,
      })
      .returning({ id: exercises.id });

    const slugs = [input.primaryMuscle, ...input.secondaryMuscles];
    const muscles = await tx
      .select({ id: muscleGroups.id, slug: muscleGroups.slug })
      .from(muscleGroups)
      .where(inArray(muscleGroups.slug, slugs));
    if (!muscles.some((m) => m.slug === input.primaryMuscle))
      throw new Error("Unknown muscle group");

    await tx.insert(exerciseMuscles).values(
      muscles.map((m) => {
        const primary = m.slug === input.primaryMuscle;
        return {
          exerciseId: created.id,
          muscleId: m.id,
          role: primary ? ("primary" as const) : ("secondary" as const),
          contribution: primary ? 1 : 0.5,
        };
      }),
    );
    return created;
  });
}
