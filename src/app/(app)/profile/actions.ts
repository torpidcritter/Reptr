"use server";

import { createHash } from "node:crypto";
import { db } from "@/db";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { IDENTITY_COOKIE } from "@/lib/identity-cookie";
import { emptyFolder } from "@/lib/supabase/storage";
import { photoBucket } from "@/modules/body/body";
import { avatarBucket } from "@/modules/social/avatars";
import { deleteAccount, deleteConfirmWord } from "@/modules/ops/account";

export type DeleteState = { error?: string; deleted?: boolean };

/** Deletes the profile and everything in it: rows, photos and this browser's cookie. */
export async function deleteAccountAction(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim() !== deleteConfirmWord) {
    return { error: `Type ${deleteConfirmWord} in capitals to confirm.` };
  }
  const busy = await overLimit(user.id, "accountDelete");
  if (busy) return { error: busy };

  // Photos live in storage, outside the database, so they go first. The whole folder is
  // emptied (including uploads that never got a row) and checked to be empty. If that
  // fails nothing else is deleted, so the account is still whole and the delete can be
  // retried. If the database delete fails after it, the photos are already gone, which is
  // what was asked for, and a retry finishes the rest.
  const ref = createHash("sha256").update(user.id).digest("hex").slice(0, 12);
  let photos = 0;
  try {
    photos = await emptyFolder(photoBucket, user.id);
    photos += await emptyFolder(avatarBucket, user.id);
  } catch (err) {
    log.error("account_delete_photos_failed", { err, ref });
    return { error: "Your photos couldn't be removed, so nothing was deleted. Try again." };
  }
  try {
    await deleteAccount(db, user.id);
  } catch (err) {
    log.error("account_delete_failed", { err, ref, photos });
    return { error: "Your account couldn't be deleted. Your photos are gone; try again." };
  }
  // Logged without the id itself, so the log can't be tied back to the person.
  log.info("account_deleted", { ref, photos });
  (await cookies()).delete(IDENTITY_COOKIE);
  // The page then clears this profile's data from the device and goes to create-profile.
  return { deleted: true };
}
