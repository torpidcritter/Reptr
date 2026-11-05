import { sql } from "drizzle-orm";
import { check, date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt, ownerPolicy, updatedAt } from "./helpers";
import { experienceLevel, themePreference, trainingGoal, unitSystem } from "./enums";

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    dateOfBirth: date("date_of_birth"),
    heightCm: numeric("height_cm", { precision: 5, scale: 1, mode: "number" }),
    unitSystem: unitSystem("unit_system").notNull().default("metric"),
    theme: themePreference("theme").notNull().default("system"),
    experience: experienceLevel("experience"),
    goal: trainingGoal("goal").notNull().default("all_round"),
    trainingDaysPerWeek: integer("training_days_per_week"),
    /** Preferred training weekdays, Monday = 0. */
    trainingDays: integer("training_days")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    /** What the user can train with, as keys from `equipmentOptions`. */
    equipment: text("equipment")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    ownerPolicy("profiles", t.userId),
    check("profiles_height_range", sql`${t.heightCm} is null or ${t.heightCm} between 50 and 272`),
    check(
      "profiles_days_range",
      sql`${t.trainingDaysPerWeek} is null or ${t.trainingDaysPerWeek} between 1 and 7`,
    ),
    check("profiles_rest_range", sql`${t.defaultRestSeconds} between 0 and 1800`),
  ],
);
