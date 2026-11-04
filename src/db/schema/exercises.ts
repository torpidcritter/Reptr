import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import { createdAt, id, isOwner, readOnlyPolicy, updatedAt } from "./helpers";
import { bodyRegion, exerciseCategory, measurementType, muscleRole } from "./enums";

export const muscleGroups = pgTable(
  "muscle_groups",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    region: bodyRegion("region").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  () => [readOnlyPolicy("muscle_groups")],
).enableRLS();

export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
  },
  () => [readOnlyPolicy("equipment")],
).enableRLS();

/** Built-in exercises have no owner. Custom exercises belong to one user. */
export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => authUsers.id, { onDelete: "cascade" }),
    slug: text("slug"),
    name: text("name").notNull(),
    category: exerciseCategory("category").notNull(),
    measurement: measurementType("measurement").notNull().default("weight_reps"),
    equipmentId: uuid("equipment_id").references(() => equipment.id),
    movementPattern: text("movement_pattern"),
    isUnilateral: boolean("is_unilateral").notNull().default(false),
    instructions: text("instructions"),
    formCues: text("form_cues"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("exercises_builtin_slug_idx")
      .on(t.slug)
      .where(sql`${t.ownerId} is null`),
    uniqueIndex("exercises_owner_name_idx")
      .on(t.ownerId, sql`lower(${t.name})`)
      .where(sql`${t.ownerId} is not null`),
    index("exercises_name_idx").on(t.name),
    check("exercises_builtin_has_slug", sql`${t.ownerId} is not null or ${t.slug} is not null`),
    pgPolicy("exercises_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.ownerId} is null or ${isOwner(t.ownerId)}`,
    }),
    pgPolicy("exercises_owner_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isOwner(t.ownerId),
    }),
    pgPolicy("exercises_owner_update", {
      for: "update",
      to: authenticatedRole,
      using: isOwner(t.ownerId),
      withCheck: isOwner(t.ownerId),
    }),
    pgPolicy("exercises_owner_delete", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.ownerId),
    }),
  ],
);

/**
 * How much an exercise trains each muscle (0–1). A bench press might be chest 1.0,
 * front delts 0.5, triceps 0.5, so weekly sets per muscle can be weighted.
 */
export const exerciseMuscles = pgTable(
  "exercise_muscles",
  {
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleId: uuid("muscle_id")
      .notNull()
      .references(() => muscleGroups.id),
    role: muscleRole("role").notNull().default("primary"),
    contribution: numeric("contribution", { precision: 3, scale: 2, mode: "number" })
      .notNull()
      .default(1),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.muscleId] }),
    index("exercise_muscles_muscle_idx").on(t.muscleId),
    check(
      "exercise_muscles_contribution_range",
      sql`${t.contribution} > 0 and ${t.contribution} <= 1`,
    ),
    pgPolicy("exercise_muscles_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from exercises e where e.id = ${t.exerciseId} and (e.owner_id is null or e.owner_id = (select auth.uid())))`,
    }),
    pgPolicy("exercise_muscles_owner_write", {
      for: "all",
      to: authenticatedRole,
      using: sql`exists (select 1 from exercises e where e.id = ${t.exerciseId} and e.owner_id = (select auth.uid()))`,
      withCheck: sql`exists (select 1 from exercises e where e.id = ${t.exerciseId} and e.owner_id = (select auth.uid()))`,
    }),
  ],
);
