import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { exercises } from "./exercises";
import { goalKind } from "./enums";
import { createdAt, id, ownerPolicy, userId } from "./helpers";

/**
 * Something to aim for. Strength goals are an estimated 1RM in kg for one exercise,
 * body-weight goals are kg, consistency goals are workouts per week.
 */
export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    kind: goalKind("kind").notNull(),
    exerciseId: uuid("exercise_id").references(() => exercises.id, { onDelete: "cascade" }),
    targetValue: numeric("target_value", { precision: 8, scale: 2, mode: "number" }).notNull(),
    /** Where things stood when the goal was set, so progress can be shown as a share. */
    startValue: numeric("start_value", { precision: 8, scale: 2, mode: "number" }),
    targetDate: date("target_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    // Deleting a custom exercise cascades here.
    index("goals_exercise_idx").on(t.exerciseId),
    check(
      "goals_strength_has_exercise",
      sql`(${t.kind} = 'strength') = (${t.exerciseId} is not null)`,
    ),
    check("goals_target_positive", sql`${t.targetValue} > 0`),
    ownerPolicy("goals", t.userId),
  ],
);
