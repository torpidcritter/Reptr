import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createdAt, id, ownerPolicy, updatedAt, userId } from "./helpers";
import { bodyMetricType, photoPose } from "./enums";

/** Weight in kg, body fat in %, everything else in cm. */
export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: id(),
    userId: userId(),
    type: bodyMetricType("type").notNull(),
    value: numeric("value", { precision: 7, scale: 2, mode: "number" }).notNull(),
    /** How body fat was measured (scale, calipers, DEXA, visual). Methods aren't interchangeable. */
    method: text("method"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("body_metrics_user_type_idx").on(t.userId, t.type, t.recordedAt.desc()),
    check("body_metrics_value_positive", sql`${t.value} > 0`),
    check(
      "body_metrics_body_fat_range",
      sql`${t.type} <> 'body_fat' or ${t.value} between 1 and 75`,
    ),
    ownerPolicy("body_metrics", t.userId),
  ],
);

/** Photo files live in a private Supabase Storage bucket; this is the metadata. */
export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: id(),
    userId: userId(),
    pose: photoPose("pose").notNull(),
    storagePath: text("storage_path").notNull(),
    takenOn: date("taken_on").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("progress_photos_path_key").on(t.storagePath),
    index("progress_photos_user_idx").on(t.userId, t.takenOn.desc()),
    ownerPolicy("progress_photos", t.userId),
  ],
);

export const userGoals = pgTable(
  "user_goals",
  {
    id: id(),
    userId: userId(),
    metric: text("metric").notNull(),
    targetValue: numeric("target_value", { precision: 10, scale: 3, mode: "number" }).notNull(),
    targetDate: date("target_date"),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("user_goals_user_idx").on(t.userId), ownerPolicy("user_goals", t.userId)],
);
