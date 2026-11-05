import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { createdAt, id, ownerPolicy, updatedAt, userId } from "./helpers";

/**
 * One check-in per day: how the user slept and feels, and how much they moved.
 * Scores are 1-5 where 5 is best for sleep quality and energy, and worst for soreness and stress.
 */
export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: id(),
    userId: userId(),
    day: date("day").notNull(),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 2, mode: "number" }),
    sleepQuality: smallint("sleep_quality"),
    energy: smallint("energy"),
    soreness: smallint("soreness"),
    stress: smallint("stress"),
    steps: integer("steps"),
    restingHr: smallint("resting_hr"),
    /** Heart-rate variability (RMSSD) in milliseconds, as a watch or app reports it. */
    hrvMs: smallint("hrv_ms"),
    /** Muscle slugs that feel sore today. */
    soreMuscles: text("sore_muscles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("daily_checkins_user_day_key").on(t.userId, t.day),
    check(
      "daily_checkins_sleep_range",
      sql`${t.sleepHours} is null or ${t.sleepHours} between 0 and 24`,
    ),
    check(
      "daily_checkins_scores_range",
      sql`coalesce(${t.sleepQuality}, 1) between 1 and 5 and coalesce(${t.energy}, 1) between 1 and 5 and coalesce(${t.soreness}, 1) between 1 and 5 and coalesce(${t.stress}, 1) between 1 and 5`,
    ),
    check("daily_checkins_steps_range", sql`${t.steps} is null or ${t.steps} between 0 and 200000`),
    check(
      "daily_checkins_hr_range",
      sql`${t.restingHr} is null or ${t.restingHr} between 25 and 200`,
    ),
    check("daily_checkins_hrv_range", sql`${t.hrvMs} is null or ${t.hrvMs} between 5 and 300`),
    ownerPolicy("daily_checkins", t.userId),
  ],
);
