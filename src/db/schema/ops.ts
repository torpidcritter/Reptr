import {
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { createdAt, id, isOwner, ownerPolicy, userId } from "./helpers";

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

/**
 * A record of sensitive things done on an account (sign-ins, exports, photo changes,
 * changes the coach made after you confirmed them). Users can read their own; only the
 * server writes. Rows go with the account when it's deleted.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: userId(),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, string | number | boolean | null>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_user_created_idx").on(t.userId, t.createdAt.desc()),
    pgPolicy("audit_log_owner_read", {
      for: "select",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);

/**
 * Changes queued on a device while offline carry an id. The server notes each id it has
 * applied, so a retry after a dropped response never logs the same food twice.
 */
export const appliedOps = pgTable(
  "applied_ops",
  {
    userId: userId(),
    opId: uuid("op_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.opId] }), ownerPolicy("applied_ops", t.userId)],
);

/**
 * One random key per account that encrypts what the account keeps on a device (the
 * workout being logged, offline changes). The device holds it in memory only while the
 * account is signed in, so data left on a shared browser after sign-out can't be read
 * without signing in again. Only the server reads it: RLS is on with no policies.
 */
export const deviceKeys = pgTable("device_keys", {
  userId: userId().primaryKey(),
  key: text("key").notNull(),
  createdAt: createdAt(),
}).enableRLS();

/**
 * Daily counts of sync attempts by outcome (ok, conflict, validation, server error…),
 * for the beta metrics page. No user ids: only how often syncing works.
 */
export const syncStats = pgTable(
  "sync_stats",
  {
    day: date("day").notNull(),
    channel: text("channel").notNull(),
    outcome: text("outcome").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.channel, t.outcome] })],
).enableRLS();
