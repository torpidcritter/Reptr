"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getUser, requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeFiles } from "@/lib/supabase/storage";
import { photoBucket } from "@/modules/body/body";
import { deleteAccount, deleteConfirmWord, photoPaths } from "@/modules/ops/account";
import { audit } from "@/modules/ops/audit";

export async function signOut() {
  const user = await getUser();
  if (user) await audit(db, user.id, "signed_out");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type DeleteState = { error?: string };

/** Deletes the account and everything in it: rows, photos and the sign-in itself. */
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

  // Photos live in storage, outside the database, so they're removed first.
  const paths = await photoPaths(db, user.id);
  try {
    for (let i = 0; i < paths.length; i += 100) {
      await removeFiles(photoBucket, paths.slice(i, i + 100));
    }
  } catch (err) {
    log.error("account_delete_photos_failed", { err, photos: paths.length });
    return { error: "Your photos couldn't be removed, so nothing was deleted. Try again." };
  }
  await deleteAccount(db, user.id);
  // Logged without the id itself, so the log can't be tied back to the person.
  log.info("account_deleted", {
    ref: createHash("sha256").update(user.id).digest("hex").slice(0, 12),
    photos: paths.length,
  });
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {}
  redirect("/login?deleted=1");
}
