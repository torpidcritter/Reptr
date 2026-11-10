import { sql } from "drizzle-orm";
import type { Database } from "./types";

/**
 * Runs queries as the signed-in user instead of the database owner, so Postgres
 * row-level security applies on top of the app's own `where user_id = …` filters: a
 * query that forgets the filter still only sees this user's rows (and shared rows the
 * policies allow, such as the exercise library or, later, posts the user may see).
 *
 * Everything is transaction-local (`set local`, `set_config(..., true)`), so it works
 * through Supabase's transaction pooler (port 6543) and can't leak into the next
 * request that reuses the connection.
 *
 * Use it for every read that can return another person's data (social features) and
 * for bulk reads of a user's data (export). Writes the user isn't allowed to make
 * directly (audit log, rate limits, usage records) stay on the owner connection.
 */
export async function withUser<T>(db: Database, userId: string, fn: (tx: Database) => Promise<T>) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("withUser needs a user id");
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as unknown as Database);
  });
}
