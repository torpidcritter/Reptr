import { sql } from "drizzle-orm";
import type { Database } from "@/db";

export { deleteConfirmWord } from "./confirm-word";

/**
 * Deletes the sign-in account. Every table that holds the user's data references
 * auth.users with ON DELETE CASCADE, so this removes all of it in one statement.
 */
export async function deleteAccount(db: Database, userId: string) {
  const res = await db.execute(sql`delete from auth.users where id = ${userId}`);
  return res.count > 0;
}
