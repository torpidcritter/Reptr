"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { endProgram, programSchema, startProgram } from "@/modules/programs/programs";

export async function startProgramAction(payload: {
  name: string;
  startDate: string;
  weeks: string;
  deloadEvery: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = programSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await startProgram(db, user.id, parsed.data);
  revalidatePath("/programs");
  revalidatePath("/history");
  return {};
}

export async function endProgramAction() {
  const user = await requireUser();
  await endProgram(db, user.id);
  revalidatePath("/programs");
  revalidatePath("/history");
}
