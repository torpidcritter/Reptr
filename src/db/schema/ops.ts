import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window request counters, one row per key (for example "coach:<user id>").
 * Kept in Postgres so the limit holds across every server instance. Only the server
 * touches it: RLS is on with no policies, so signed-in clients can't read or reset it.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
}).enableRLS();
