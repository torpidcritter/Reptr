import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { savedFoods, type Ingredient } from "@/db/schema";
import type { Database } from "@/db/types";

const g = z.number().min(0).max(1000).default(0);
const name = z.string().trim().min(1, "Give it a name.").max(80);

export const savedFoodSchema = z.object({
  name,
  servingLabel: z.string().trim().min(1).max(40).default("1 serving"),
  calories: z.number().int().min(0).max(10000),
  proteinG: g,
  carbsG: g,
  fatG: g,
});

const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Name each ingredient.").max(80),
  calories: z.number().int().min(0).max(20000),
  proteinG: z.number().min(0).max(2000).default(0),
  carbsG: z.number().min(0).max(2000).default(0),
  fatG: z.number().min(0).max(2000).default(0),
});

export const recipeSchema = z.object({
  name,
  servings: z.number().min(1, "At least one serving.").max(50),
  ingredients: z.array(ingredientSchema).min(1, "Add an ingredient.").max(40),
});

export class DuplicateFoodError extends Error {}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Per-serving macros of a recipe from its whole-batch ingredients. */
export function perServing(ingredients: Ingredient[], servings: number) {
  const sum = (k: keyof Omit<Ingredient, "name">) =>
    ingredients.reduce((n, i) => n + i[k], 0) / servings;
  return {
    calories: Math.round(sum("calories")),
    proteinG: r1(sum("proteinG")),
    carbsG: r1(sum("carbsG")),
    fatG: r1(sum("fatG")),
  };
}

/** A log entry for `servings` of a saved food. */
export function portion(
  f: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number },
  servings: number,
) {
  return {
    name: servings === 1 ? f.name : `${f.name} × ${r1(servings)}`,
    calories: Math.round(f.calories * servings),
    proteinG: r1(f.proteinG * servings),
    carbsG: r1(f.carbsG * servings),
    fatG: r1(f.fatG * servings),
  };
}

async function insert(db: Database, values: typeof savedFoods.$inferInsert) {
  try {
    const [row] = await db.insert(savedFoods).values(values).returning({ id: savedFoods.id });
    return row;
  } catch (e) {
    const code =
      (e as { code?: string; cause?: { code?: string } }).cause?.code ??
      (e as { code?: string }).code;
    if (code === "23505") throw new DuplicateFoodError(`You already have "${values.name}".`);
    throw e;
  }
}

export async function saveFood(db: Database, userId: string, f: z.infer<typeof savedFoodSchema>) {
  return insert(db, { userId, kind: "food", ...f });
}

export async function saveRecipe(db: Database, userId: string, r: z.infer<typeof recipeSchema>) {
  return insert(db, {
    userId,
    kind: "recipe",
    name: r.name,
    servingLabel: "1 serving",
    servings: r.servings,
    ingredients: r.ingredients,
    ...perServing(r.ingredients, r.servings),
  });
}

export async function listSavedFoods(db: Database, userId: string) {
  return db
    .select({
      id: savedFoods.id,
      kind: savedFoods.kind,
      name: savedFoods.name,
      servingLabel: savedFoods.servingLabel,
      calories: savedFoods.calories,
      proteinG: savedFoods.proteinG,
      carbsG: savedFoods.carbsG,
      fatG: savedFoods.fatG,
      servings: savedFoods.servings,
    })
    .from(savedFoods)
    .where(eq(savedFoods.userId, userId))
    .orderBy(asc(savedFoods.name));
}

export async function getSavedFood(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(savedFoods)
    .where(and(eq(savedFoods.id, id), eq(savedFoods.userId, userId)));
  return row ?? null;
}

export async function deleteSavedFood(db: Database, userId: string, id: string) {
  await db.delete(savedFoods).where(and(eq(savedFoods.id, id), eq(savedFoods.userId, userId)));
}
