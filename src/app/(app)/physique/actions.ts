"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { audit } from "@/modules/ops/audit";
import { overLimit } from "@/lib/guard";
import { getTimeZone, requireUser } from "@/lib/auth";
import { log } from "@/lib/log";
import {
  removeFiles,
  removeOrphanedFiles,
  signedUpload,
  storageEnabled,
} from "@/lib/supabase/storage";
import {
  addPhoto,
  deleteMetric,
  deletePhoto,
  entrySchema,
  getPhoto,
  listPhotos,
  logEntry,
  logWeight,
  updateWeight,
  weightSchema,
  photoBucket,
  PHOTO_LIMIT,
  photoLimitMessage,
  photoSchema,
} from "@/modules/body/body";

export async function logEntryAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await logEntry(db, user.id, parsed.data, await getTimeZone());
  revalidatePath("/physique");
  revalidatePath("/");
  return {};
}

const weightChanged = () => {
  revalidatePath("/physique");
  revalidatePath("/progress");
  revalidatePath("/");
};

/** Logs a weigh-in, or changes one when `id` is given. Weight arrives in kg. */
export async function saveWeightAction(payload: unknown, id?: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const parsed = weightSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (id) {
    if (!z.uuid().safeParse(id).success) return { error: "That weigh-in wasn't found." };
    const ok = await updateWeight(db, user.id, id, parsed.data, await getTimeZone());
    if (!ok) return { error: "That weigh-in wasn't found." };
  } else {
    await logWeight(db, user.id, parsed.data, await getTimeZone());
  }
  weightChanged();
  return {};
}

export async function deleteMetricAction(id: string) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return;
  await deleteMetric(db, user.id, id);
  weightChanged();
}

/**
 * A one-time link to upload one progress photo into the person's own folder. The photo
 * limit is checked here, since uploads no longer go through per-user storage policies.
 */
export async function photoUploadAction(): Promise<
  { path: string; token: string } | { error: string }
> {
  const user = await requireUser();
  if (!storageEnabled()) return { error: "Photos aren't available yet." };
  const busy = await overLimit(user.id, "photo");
  if (busy) return { error: busy };
  if ((await listPhotos(db, user.id)).length >= PHOTO_LIMIT) return { error: photoLimitMessage };
  try {
    return await signedUpload(photoBucket, `${user.id}/${randomUUID()}.jpg`);
  } catch (err) {
    log.error("photo_upload_link_failed", { err });
    return { error: "The photo couldn't be uploaded. Try again." };
  }
}

export async function addPhotoAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "photo");
  if (busy) return { error: busy };
  const parsed = photoSchema.safeParse(payload);
  if (!parsed.success) return { error: "That photo couldn't be saved." };
  if ((await listPhotos(db, user.id)).length >= PHOTO_LIMIT) return { error: photoLimitMessage };
  await addPhoto(db, user.id, parsed.data);
  await audit(db, user.id, "photo_added");
  await tidyPhotos(user.id);
  revalidatePath("/physique");
  return {};
}

/**
 * Deletes a photo: the file first, checked to be gone, then its row. If the file can't be
 * removed the row stays, so the photo is still listed and the delete can be retried.
 */
export async function deletePhotoAction(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return { error: "That photo wasn't found." };
  const row = await getPhoto(db, user.id, id);
  if (!row) return {};
  try {
    await removeFiles(photoBucket, [row.storagePath]);
  } catch (err) {
    log.error("photo_delete_failed", { err });
    return { error: "The photo couldn't be deleted. Nothing was changed; try again." };
  }
  await deletePhoto(db, user.id, id);
  await audit(db, user.id, "photo_deleted");
  revalidatePath("/physique");
  return {};
}

/** Best effort: removes uploads in the user's folder that never got a row. */
async function tidyPhotos(userId: string) {
  try {
    const known = (await listPhotos(db, userId)).map((p) => p.storagePath);
    const removed = await removeOrphanedFiles(photoBucket, userId, known);
    if (removed) log.info("orphan_photos_removed", { count: removed });
  } catch (err) {
    log.warn("orphan_photo_check_failed", { err });
  }
}
