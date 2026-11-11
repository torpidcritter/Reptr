"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { IDENTITY_COOKIE } from "@/lib/identity-cookie";
import { log } from "@/lib/log";
import { removeFiles, signedUpload, storageEnabled } from "@/lib/supabase/storage";
import { audit } from "@/modules/ops/audit";
import { fieldsFrom, formErrors, type IdentityFormState } from "@/modules/profile/form";
import {
  forgetDevice,
  ProfileError,
  replaceProfileKey,
  setAvatarPath,
  updateIdentity,
} from "@/modules/profile/identity";
import { avatarBucket, avatarPath } from "@/modules/social/avatars";

const refresh = () => {
  revalidatePath("/", "layout");
};

/** Saves name, username, email and bio. */
export async function updateIdentityAction(
  _prev: IdentityFormState,
  form: FormData,
): Promise<IdentityFormState> {
  const user = await requireUser();
  const values = fieldsFrom(form);
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy, values };
  try {
    await updateIdentity(db, user.id, values);
  } catch (e) {
    const shown = formErrors(e);
    if (shown) return { ...shown, values };
    log.error("profile_update_failed", { err: e });
    return { error: "Your profile couldn't be saved. Try again.", values };
  }
  await audit(db, user.id, "profile_updated");
  refresh();
  return { ok: true, values };
}

/** A one-time link to upload a new profile picture to the person's own folder. */
export async function avatarUploadAction(): Promise<
  { path: string; token: string } | { error: string }
> {
  const user = await requireUser();
  if (!storageEnabled()) return { error: "Profile pictures aren't available yet." };
  const busy = await overLimit(user.id, "photo");
  if (busy) return { error: busy };
  try {
    return await signedUpload(avatarBucket, avatarPath(user.id, randomUUID()));
  } catch (err) {
    log.error("avatar_upload_link_failed", { err });
    return { error: "The picture couldn't be uploaded. Try again." };
  }
}

/** Points the profile at an uploaded picture (or none), and removes the old file. */
export async function setAvatarAction(path: string | null): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  let before: string | null;
  try {
    before = await setAvatarPath(db, user.id, path);
  } catch (e) {
    if (e instanceof ProfileError) return { error: e.message };
    log.error("avatar_failed", { err: e });
    return { error: "The picture couldn't be saved. Try again." };
  }
  if (before && before !== path) {
    await removeFiles(avatarBucket, [before]).catch((err) =>
      log.warn("avatar_cleanup_failed", { err }),
    );
  }
  refresh();
  return {};
}

/** A new profile key. The old one stops working. Shown once. */
export async function newProfileKeyAction(): Promise<{ key?: string; error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "accountDelete");
  if (busy) return { error: busy };
  const key = await replaceProfileKey(db, user.id);
  await audit(db, user.id, "profile_key_replaced");
  return { key };
}

/**
 * Forgets the profile on this browser. The profile and its data stay, and can be opened
 * again with the profile key. The device side (local data, cached pages) is cleared by
 * the button before this.
 */
export async function clearDeviceAction() {
  const user = await requireUser();
  const jar = await cookies();
  await forgetDevice(db, jar.get(IDENTITY_COOKIE)?.value);
  jar.delete(IDENTITY_COOKIE);
  await audit(db, user.id, "device_cleared");
}
