import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { progressPhotos } from "@/db/schema";

export { deleteConfirmWord } from "./confirm-word";

/** Storage paths of the user's photos, to remove from the bucket before the rows go. */
export async function photoPaths(db: Database, userId: string) {
  const rows = await db
    .select({ path: progressPhotos.storagePath })
    .from(progressPhotos)
    .where(eq(progressPhotos.userId, userId));
  return rows.map((r) => r.path);
}

/**
 * Deletes the sign-in account. Every table that holds the user's data references
 * auth.users with ON DELETE CASCADE, so this removes all of it in one statement.
 */
export async function deleteAccount(db: Database, userId: string) {
  const res = await db.execute(sql`delete from auth.users where id = ${userId}`);
  return res.count > 0;
}
