"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import {
  archiveRoutine,
  duplicateRoutine,
  RoutineNotFoundError,
  routineSchema,
  saveRoutine,
} from "@/modules/routines/routines";

export type SaveRoutineResult = { error?: string };

export async function saveRoutineAction(
  routineId: string | null,
  payload: unknown,
): Promise<SaveRoutineResult> {
  const user = await requireUser();
  const parsed = routineSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await saveRoutine(db, user.id, parsed.data, routineId ?? undefined);
  } catch (e) {
    if (e instanceof RoutineNotFoundError) return { error: "That routine no longer exists." };
    throw e;
  }
  revalidatePath("/routines");
  redirect("/routines");
}

export async function archiveRoutineAction(id: string) {
  const user = await requireUser();
  await archiveRoutine(db, user.id, id);
  revalidatePath("/routines");
}

export async function duplicateRoutineAction(id: string) {
  const user = await requireUser();
  await duplicateRoutine(db, user.id, id);
  revalidatePath("/routines");
}
