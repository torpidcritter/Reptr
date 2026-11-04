import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-side database client. It connects as the database owner and bypasses
// row-level security, so every query must filter by the signed-in user's id.
const globalForDb = globalThis as unknown as { client?: postgres.Sql };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase's pooler (port 6543) runs in transaction mode, which doesn't support prepared statements.
  return postgres(url, { prepare: false, max: 5 });
}

const client = globalForDb.client ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
export { schema };
