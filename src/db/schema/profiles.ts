import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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
    /**
     * The person's unique username: lowercase letters, digits and underscores. Their social
     * handle is always the same (migration 0034 keeps `social_profiles` in step).
     */
    username: text("username"),
    bio: text("bio"),
    /** Path in the private `avatars` bucket: "<user id>/<file>". */
    avatarPath: text("avatar_path"),
    /** Optional, never verified and never used to sign in. Only the person can read it. */
    contactEmail: text("contact_email"),
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
    /** Optional modules the user has turned on. Workout tracking never needs them. */
    trackNutrition: boolean("track_nutrition").notNull().default(false),
    trackRecovery: boolean("track_recovery").notNull().default(false),
    defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    ownerPolicy("profiles", t.userId),
    unique("profiles_username_key").on(t.username),
    check(
      "profiles_username_format",
      sql`${t.username} is null or ${t.username} ~ '^[a-z0-9_]{3,20}$'`,
    ),
    check("profiles_bio_length", sql`${t.bio} is null or char_length(${t.bio}) <= 160`),
    check(
      "profiles_avatar_path",
      sql`${t.avatarPath} is null or ${t.avatarPath} like ${t.userId}::text || '/%'`,
    ),
    check(
      "profiles_contact_email",
      sql`${t.contactEmail} is null or (char_length(${t.contactEmail}) <= 254 and ${t.contactEmail} ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')`,
    ),
    check("profiles_height_range", sql`${t.heightCm} is null or ${t.heightCm} between 50 and 272`),
    check(
      "profiles_days_range",
      sql`${t.trainingDaysPerWeek} is null or ${t.trainingDaysPerWeek} between 1 and 7`,
    ),
    check("profiles_rest_range", sql`${t.defaultRestSeconds} between 0 and 1800`),
  ],
);
