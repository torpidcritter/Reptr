import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, ownerPolicy, updatedAt, userId } from "./helpers";
import { exercises } from "./exercises";
import { recordType, setType, workoutStatus } from "./enums";

// Child tables carry user_id too, tied to the parent's owner by a composite foreign key.
// That keeps row-level security a cheap column check and makes cross-user links impossible.
// Ids are generated on the device during a workout, so a retried save is an idempotent upsert.

/** A reusable template. Editing it never changes past workouts. */
export const routines = pgTable(
  "routines",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("routines_id_user_key").on(t.id, t.userId),
    index("routines_user_idx").on(t.userId),
    ownerPolicy("routines", t.userId),
  ],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: id(),
    userId: userId(),
    routineId: uuid("routine_id").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    supersetGroup: integer("superset_group"),
    targetSets: integer("target_sets"),
    targetRepsMin: integer("target_reps_min"),
    targetRepsMax: integer("target_reps_max"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
  },
  (t) => [
    foreignKey({
      name: "routine_exercises_routine_fk",
      columns: [t.routineId, t.userId],
      foreignColumns: [routines.id, routines.userId],
    }).onDelete("cascade"),
    unique("routine_exercises_position_key").on(t.routineId, t.position),
    check(
      "routine_exercises_reps_range",
      sql`${t.targetRepsMin} is null or ${t.targetRepsMax} is null or ${t.targetRepsMin} <= ${t.targetRepsMax}`,
    ),
    ownerPolicy("routine_exercises", t.userId),
  ],
);

/** An actual training session. */
export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    userId: userId(),
    routineId: uuid("routine_id"),
    name: text("name").notNull(),
    status: workoutStatus("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("workouts_id_user_key").on(t.id, t.userId),
    foreignKey({
      name: "workouts_routine_fk",
      columns: [t.routineId],
      foreignColumns: [routines.id],
    }).onDelete("set null"),
    index("workouts_user_started_idx").on(t.userId, t.startedAt.desc()),
    // Only one workout can be in progress at a time.
    uniqueIndex("workouts_one_in_progress_idx")
      .on(t.userId)
      .where(sql`${t.status} in ('active', 'paused')`),
    check(
      "workouts_finished_after_start",
      sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`,
    ),
    check(
      "workouts_completed_has_finish",
      sql`${t.status} not in ('completed', 'abandoned') or ${t.finishedAt} is not null`,
    ),
    ownerPolicy("workouts", t.userId),
  ],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: id(),
    userId: userId(),
    workoutId: uuid("workout_id").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    supersetGroup: integer("superset_group"),
    substitutedFromId: uuid("substituted_from_id").references(() => exercises.id),
    notes: text("notes"),
  },
  (t) => [
    unique("workout_exercises_id_user_key").on(t.id, t.userId),
    foreignKey({
      name: "workout_exercises_workout_fk",
      columns: [t.workoutId, t.userId],
      foreignColumns: [workouts.id, workouts.userId],
    }).onDelete("cascade"),
    unique("workout_exercises_position_key").on(t.workoutId, t.position),
    index("workout_exercises_exercise_idx").on(t.userId, t.exerciseId),
    ownerPolicy("workout_exercises", t.userId),
  ],
);

/** One row per set. Stored in kg, metres and seconds. */
export const workoutSets = pgTable(
  "workout_sets",
  {
    id: id(),
    userId: userId(),
    workoutExerciseId: uuid("workout_exercise_id").notNull(),
    setNumber: integer("set_number").notNull(),
    type: setType("type").notNull().default("working"),
    weightKg: numeric("weight_kg", { precision: 7, scale: 3, mode: "number" }),
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: numeric("distance_meters", { precision: 10, scale: 2, mode: "number" }),
    rpe: numeric("rpe", { precision: 3, scale: 1, mode: "number" }),
    /** Reps in reserve: how many more reps were left in the tank. */
    rir: integer("rir"),
    /** Tempo as eccentric, pause, concentric, pause, e.g. "3010" or "31X0". */
    tempo: text("tempo"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "workout_sets_workout_exercise_fk",
      columns: [t.workoutExerciseId, t.userId],
      foreignColumns: [workoutExercises.id, workoutExercises.userId],
    }).onDelete("cascade"),
    unique("workout_sets_number_key").on(t.workoutExerciseId, t.setNumber),
    check("workout_sets_set_number_positive", sql`${t.setNumber} >= 1`),
    check(
      "workout_sets_weight_range",
      sql`${t.weightKg} is null or ${t.weightKg} between 0 and 1000`,
    ),
    check("workout_sets_reps_range", sql`${t.reps} is null or ${t.reps} between 0 and 1000`),
    check(
      "workout_sets_duration_range",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} >= 0`,
    ),
    check(
      "workout_sets_distance_range",
      sql`${t.distanceMeters} is null or ${t.distanceMeters} >= 0`,
    ),
    check("workout_sets_rpe_range", sql`${t.rpe} is null or ${t.rpe} between 1 and 10`),
    check("workout_sets_rir_range", sql`${t.rir} is null or ${t.rir} between 0 and 10`),
    check("workout_sets_tempo_format", sql`${t.tempo} is null or ${t.tempo} ~ '^[0-9X]{4}$'`),
    check("workout_sets_notes_length", sql`${t.notes} is null or char_length(${t.notes}) <= 200`),
    ownerPolicy("workout_sets", t.userId),
  ],
);

/** A record set by a specific completed set. Recomputed from sets, never typed in. */
export const personalRecords = pgTable(
  "personal_records",
  {
    id: id(),
    userId: userId(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    type: recordType("type").notNull(),
    value: numeric("value", { precision: 12, scale: 3, mode: "number" }).notNull(),
    setId: uuid("set_id").references(() => workoutSets.id, { onDelete: "cascade" }),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("personal_records_lookup_idx").on(t.userId, t.exerciseId, t.type, t.achievedAt.desc()),
    ownerPolicy("personal_records", t.userId),
  ],
);
