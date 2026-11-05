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
import { z } from "zod";
import {
  deleteSavedFood,
  DuplicateFoodError,
  getSavedFood,
  portion,
  recipeSchema,
  saveFood,
  savedFoodSchema,
  saveRecipe,
} from "@/modules/nutrition/foods";

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

async function saving(fn: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DuplicateFoodError) return { error: e.message };
    throw e;
  }
  revalidatePath("/nutrition");
  return {};
}

export async function saveFoodAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = savedFoodSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return saving(() => saveFood(db, user.id, parsed.data));
}

export async function saveRecipeAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = recipeSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return saving(() => saveRecipe(db, user.id, parsed.data));
}

export async function deleteSavedFoodAction(id: string) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return;
  await deleteSavedFood(db, user.id, id);
  revalidatePath("/nutrition");
}

const logSchema = z.object({
  id: z.uuid(),
  servings: z.number().min(0.1).max(20),
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Logs servings of a saved food or recipe, with macros scaled on the server. */
export async function logSavedFoodAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const p = logSchema.safeParse(payload);
  if (!p.success) return { error: "Servings must be between 0.1 and 20." };
  const food = await getSavedFood(db, user.id, p.data.id);
  if (!food) return { error: "That food isn't in your list any more." };
  const entry = foodSchema.safeParse({
    ...portion(food, p.data.servings),
    meal: p.data.meal,
    day: p.data.day,
  });
  if (!entry.success) return { error: "That portion is too large to log." };
  await addFood(db, user.id, entry.data);
  done();
  return {};
}
