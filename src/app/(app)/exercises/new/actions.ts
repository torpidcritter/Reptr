"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import {
  createCustomExercise,
  customExerciseSchema,
  DuplicateExerciseError,
} from "@/modules/exercises/custom";

export type NewExerciseState = { errors?: Record<string, string[] | undefined> };

export async function createExercise(
  _prev: NewExerciseState,
  formData: FormData,
): Promise<NewExerciseState> {
  const user = await requireUser();
  const parsed = customExerciseSchema.safeParse({
    ...Object.fromEntries(formData),
    secondaryMuscles: formData.getAll("secondaryMuscles"),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  let id: string;
  try {
    ({ id } = await createCustomExercise(db, user.id, parsed.data));
  } catch (e) {
    if (e instanceof DuplicateExerciseError) return { errors: { name: [e.message] } };
    throw e;
  }
  redirect(`/exercises/${id}`);
}
