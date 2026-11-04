import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-side database client. It connects as the database owner and bypasses
// row-level security, so every query must filter by the signed-in user's id.

type Db = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { db?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  // Supabase's pooler (port 6543) runs in transaction mode, which doesn't support prepared statements.
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

/** Created on first use, so builds and pages that don't touch the database don't need DATABASE_URL. */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    globalForDb.db ??= createDb();
    return Reflect.get(globalForDb.db, prop, receiver);
  },
});

export { schema };
