import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, ownerPolicy, userId } from "./helpers";

/**
 * A training block of several weeks on top of the weekly routine schedule, with a lighter
 * deload week every few weeks. One active block per user.
 */
export const programs = pgTable(
  "programs",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    /** The Monday the block starts. */
    startDate: date("start_date").notNull(),
    weeks: smallint("weeks").notNull(),
    /** Every Nth week is a deload; null for none. */
    deloadEvery: smallint("deload_every"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("programs_user_idx").on(t.userId),
    uniqueIndex("programs_one_active")
      .on(t.userId)
      .where(sql`${t.archivedAt} is null`),
    check("programs_weeks_range", sql`${t.weeks} between 2 and 16`),
    check(
      "programs_deload_range",
      sql`${t.deloadEvery} is null or ${t.deloadEvery} between 3 and 8`,
    ),
    ownerPolicy("programs", t.userId),
  ],
);
