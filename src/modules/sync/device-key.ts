import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { deviceKeys } from "@/db/schema";

/**
 * The account's device key (base64, 32 bytes), created on first use. Read with the owner
 * connection: signed-in clients can't reach the table, so the key only leaves the server
 * inside that person's own signed-in page.
 */
export async function deviceKey(db: Database, userId: string): Promise<string> {
  const [row] = await db
    .insert(deviceKeys)
    // Made in Postgres from two random UUIDs (244 random bits), so rendering a page never
    // calls Node's random source, which Next refuses during prerendering.
    .values({
      userId,
      key: sql`encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'base64')`,
    })
    .onConflictDoNothing()
    .returning({ key: deviceKeys.key });
  if (row) return row.key;
  const [existing] = await db
    .select({ key: deviceKeys.key })
    .from(deviceKeys)
    .where(eq(deviceKeys.userId, userId));
  return existing.key;
}
