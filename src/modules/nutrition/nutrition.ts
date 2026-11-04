import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { foodEntries, nutritionTargets, waterEntries } from "@/db/schema";
import type { Database } from "@/db/types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const g = z.number().min(0).max(1000).default(0);

export const foodSchema = z.object({
  day,
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().trim().min(1, "Name the food").max(120),
  calories: z.number().int().min(0).max(10000),
  proteinG: g,
  carbsG: g,
  fatG: g,
});
export type FoodInput = z.infer<typeof foodSchema>;

export const targetsSchema = z.object({
  calories: z.number().int().min(500).max(10000).nullable(),
  proteinG: z.number().min(0).max(1000).nullable(),
  carbsG: z.number().min(0).max(2000).nullable(),
  fatG: z.number().min(0).max(1000).nullable(),
  waterMl: z.number().int().min(250).max(10000).nullable(),
});

export async function addFood(db: Database, userId: string, f: FoodInput) {
  await db.insert(foodEntries).values({ userId, ...f });
}

export async function deleteFood(db: Database, userId: string, id: string) {
  await db.delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
}

/** Water is a running total: negative amounts undo a mistaken tap. Never goes below zero. */
export async function addWater(db: Database, userId: string, d: string, ml: number) {
  return db.transaction(async (tx) => {
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${waterEntries.ml}), 0)::int` })
      .from(waterEntries)
      .where(and(eq(waterEntries.userId, userId), eq(waterEntries.day, d)));
    const change = Math.max(ml, -total);
    if (change !== 0) await tx.insert(waterEntries).values({ userId, day: d, ml: change });
    return total + change;
  });
}

export async function getTargets(db: Database, userId: string) {
  const [row] = await db.select().from(nutritionTargets).where(eq(nutritionTargets.userId, userId));
  return row ?? null;
}

export async function saveTargets(db: Database, userId: string, t: z.infer<typeof targetsSchema>) {
  await db
    .insert(nutritionTargets)
    .values({ userId, ...t })
    .onConflictDoUpdate({ target: nutritionTargets.userId, set: t });
}

export async function dayLog(db: Database, userId: string, d: string) {
  const [foods, [water]] = await Promise.all([
    db
      .select()
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, userId), eq(foodEntries.day, d)))
      .orderBy(foodEntries.createdAt),
    db
      .select({ ml: sql<number>`coalesce(sum(${waterEntries.ml}), 0)::int` })
      .from(waterEntries)
      .where(and(eq(waterEntries.userId, userId), eq(waterEntries.day, d))),
  ]);
  const totals = foods.reduce(
    (t, f) => ({
      calories: t.calories + f.calories,
      proteinG: t.proteinG + f.proteinG,
      carbsG: t.carbsG + f.carbsG,
      fatG: t.fatG + f.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return { foods, waterMl: water.ml, totals };
}

/** Foods eaten before, most recent first, one per name, for one-tap re-adding. */
export async function recentFoods(db: Database, userId: string, limit = 12) {
  const latest = db
    .selectDistinctOn([sql`lower(${foodEntries.name})`], {
      name: foodEntries.name,
      meal: foodEntries.meal,
      calories: foodEntries.calories,
      proteinG: foodEntries.proteinG,
      carbsG: foodEntries.carbsG,
      fatG: foodEntries.fatG,
      createdAt: foodEntries.createdAt,
    })
    .from(foodEntries)
    .where(eq(foodEntries.userId, userId))
    .orderBy(sql`lower(${foodEntries.name})`, desc(foodEntries.createdAt))
    .as("latest");
  return db.select().from(latest).orderBy(desc(latest.createdAt)).limit(limit);
}

/** Daily totals for the last `days` days ending at `end`, for adherence charts. */
export async function dailyTotals(db: Database, userId: string, from: string, to: string) {
  return db
    .select({
      day: foodEntries.day,
      calories: sql<number>`sum(${foodEntries.calories})::int`,
      proteinG: sql<number>`sum(${foodEntries.proteinG})::float`,
    })
    .from(foodEntries)
    .where(and(eq(foodEntries.userId, userId), sql`${foodEntries.day} between ${from} and ${to}`))
    .groupBy(foodEntries.day)
    .orderBy(foodEntries.day);
}
