"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { audit } from "@/modules/ops/audit";
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
  await audit(db, user.id, "program_started", { name: parsed.data.name });
  revalidatePath("/programs");
  revalidatePath("/history");
  return {};
}

export async function endProgramAction() {
  const user = await requireUser();
  await endProgram(db, user.id);
  await audit(db, user.id, "program_ended");
  revalidatePath("/programs");
  revalidatePath("/history");
}
