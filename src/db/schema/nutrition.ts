import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt, id, ownerPolicy, updatedAt, userId } from "./helpers";

export const mealType = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);

const grams = (name: string) => numeric(name, { precision: 6, scale: 1, mode: "number" });

/** Daily targets the user chose (or accepted from a suggestion). */
export const nutritionTargets = pgTable(
  "nutrition_targets",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    calories: integer("calories"),
    proteinG: grams("protein_g"),
    carbsG: grams("carbs_g"),
    fatG: grams("fat_g"),
    waterMl: integer("water_ml"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "nutrition_targets_calories_range",
      sql`${t.calories} is null or ${t.calories} between 500 and 10000`,
    ),
    check(
      "nutrition_targets_water_range",
      sql`${t.waterMl} is null or ${t.waterMl} between 250 and 10000`,
    ),
    ownerPolicy("nutrition_targets", t.userId),
  ],
);

/** One food eaten on a day. Macros are for the portion eaten, not per 100 g. */
export const foodEntries = pgTable(
  "food_entries",
  {
    id: id(),
    userId: userId(),
    day: date("day").notNull(),
    meal: mealType("meal").notNull().default("snack"),
    name: text("name").notNull(),
    calories: integer("calories").notNull().default(0),
    proteinG: grams("protein_g").notNull().default(0),
    carbsG: grams("carbs_g").notNull().default(0),
    fatG: grams("fat_g").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("food_entries_user_day_idx").on(t.userId, t.day),
    check("food_entries_calories_range", sql`${t.calories} between 0 and 10000`),
    check(
      "food_entries_macros_range",
      sql`${t.proteinG} >= 0 and ${t.carbsG} >= 0 and ${t.fatG} >= 0 and ${t.proteinG} + ${t.carbsG} + ${t.fatG} <= 2000`,
    ),
    ownerPolicy("food_entries", t.userId),
  ],
);

export const waterEntries = pgTable(
  "water_entries",
  {
    id: id(),
    userId: userId(),
    day: date("day").notNull(),
    ml: integer("ml").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("water_entries_user_day_idx").on(t.userId, t.day),
    check("water_entries_ml_range", sql`${t.ml} between -5000 and 5000 and ${t.ml} <> 0`),
    ownerPolicy("water_entries", t.userId),
  ],
);

export type Ingredient = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * The user's own foods and recipes, with macros per serving. A recipe keeps its
 * ingredients (for the whole batch) and how many servings the batch makes.
 */
export const savedFoods = pgTable(
  "saved_foods",
  {
    id: id(),
    userId: userId(),
    kind: text("kind").notNull().default("food"),
    name: text("name").notNull(),
    servingLabel: text("serving_label").notNull().default("1 serving"),
    calories: integer("calories").notNull(),
    proteinG: grams("protein_g").notNull().default(0),
    carbsG: grams("carbs_g").notNull().default(0),
    fatG: grams("fat_g").notNull().default(0),
    servings: numeric("servings", { precision: 4, scale: 1, mode: "number" }),
    ingredients: jsonb("ingredients").$type<Ingredient[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("saved_foods_user_name_key").on(t.userId, sql`lower(${t.name})`),
    check("saved_foods_kind", sql`${t.kind} in ('food', 'recipe')`),
    check("saved_foods_calories_range", sql`${t.calories} between 0 and 10000`),
    check("saved_foods_recipe_shape", sql`(${t.kind} = 'recipe') = (${t.ingredients} is not null)`),
    ownerPolicy("saved_foods", t.userId),
  ],
);
