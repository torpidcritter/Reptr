import { sql, type SQL } from "drizzle-orm";
import { pgPolicy, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Owner column. Rows are deleted with the Supabase auth user. */
export const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

export const isOwner = (column: AnyPgColumn): SQL => sql`${column} = (select auth.uid())`;

/** Row-level security: a signed-in user can only see and change their own rows. */
export const ownerPolicy = (table: string, column: AnyPgColumn) =>
  pgPolicy(`${table}_owner_all`, {
    for: "all",
    to: authenticatedRole,
    using: isOwner(column),
    withCheck: isOwner(column),
  });

/** Row-level security for shared reference data: readable by any signed-in user. */
export const readOnlyPolicy = (table: string) =>
  pgPolicy(`${table}_read`, { for: "select", to: authenticatedRole, using: sql`true` });
