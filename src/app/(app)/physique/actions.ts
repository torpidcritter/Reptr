"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { audit } from "@/modules/ops/audit";
import { overLimit } from "@/lib/guard";
import { requireUser } from "@/lib/auth";
import { removeFiles } from "@/lib/supabase/storage";
import {
  addPhoto,
  deleteMetric,
  deletePhoto,
  entrySchema,
  logEntry,
  photoBucket,
  photoSchema,
} from "@/modules/body/body";

export async function logEntryAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await logEntry(db, user.id, parsed.data);
  revalidatePath("/physique");
  revalidatePath("/");
  return {};
}

export async function deleteMetricAction(id: string) {
  const user = await requireUser();
  await deleteMetric(db, user.id, id);
  revalidatePath("/physique");
}

export async function addPhotoAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "photo");
  if (busy) return { error: busy };
  const parsed = photoSchema.safeParse(payload);
  if (!parsed.success) return { error: "That photo couldn't be saved." };
  await addPhoto(db, user.id, parsed.data);
  await audit(db, user.id, "photo_added");
  revalidatePath("/physique");
  return {};
}

export async function deletePhotoAction(id: string) {
  const user = await requireUser();
  const row = await deletePhoto(db, user.id, id);
  if (row) {
    await removeFiles(photoBucket, [row.storagePath]);
    await audit(db, user.id, "photo_deleted");
  }
  revalidatePath("/physique");
}
