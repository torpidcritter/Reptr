"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import {
  addFood,
  addWater,
  deleteFood,
  foodSchema,
  saveTargets,
  targetsSchema,
} from "@/modules/nutrition/nutrition";

const done = () => {
  revalidatePath("/nutrition");
  revalidatePath("/");
};

export async function addFoodAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = foodSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await addFood(db, user.id, parsed.data);
  done();
  return {};
}

export async function deleteFoodAction(id: string) {
  const user = await requireUser();
  await deleteFood(db, user.id, id);
  done();
}

export async function addWaterAction(day: string, ml: number) {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(ml) || Math.abs(ml) > 5000) return;
  await addWater(db, user.id, day, ml);
  done();
}

export async function saveTargetsAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = targetsSchema.safeParse(payload);
  if (!parsed.success)
    return { error: "Check the targets: calories 500–10,000, water 250–10,000 ml." };
  await saveTargets(db, user.id, parsed.data);
  done();
  return {};
}
