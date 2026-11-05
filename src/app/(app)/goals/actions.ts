"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { overLimit } from "@/lib/guard";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { toStoredWeight } from "@/lib/units";
import { archiveGoal, createGoal, GoalExerciseError, goalSchema } from "@/modules/goals/goals";

export async function createGoalAction(payload: {
  kind: string;
  exerciseId?: string;
  target: string;
  targetDate?: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const [profile, tz] = await Promise.all([getProfile(user.id), getTimeZone()]);
  const units = profile?.unitSystem ?? "metric";
  const raw = Number(String(payload.target).replace(",", "."));
  // Weights are entered in the user's units and stored in kg.
  const targetValue =
    payload.kind === "consistency" || !Number.isFinite(raw) ? raw : toStoredWeight(raw, units);
  const parsed = goalSchema.safeParse({ ...payload, targetValue });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createGoal(db, user.id, parsed.data, tz);
  } catch (e) {
    if (e instanceof GoalExerciseError) return { error: "Pick an exercise from the list." };
    throw e;
  }
  revalidatePath("/goals");
  revalidatePath("/");
  return {};
}

export async function archiveGoalAction(id: string) {
  const user = await requireUser();
  await archiveGoal(db, user.id, id);
  revalidatePath("/goals");
  revalidatePath("/");
}
