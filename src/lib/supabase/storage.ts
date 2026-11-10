import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { orphanedFiles, type StoredFile } from "./storage-rules";

export { orphanedFiles } from "./storage-rules";

/** Photos need Supabase Storage; local dev without Supabase stores none. */
export const storageEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** A storage call that failed, or files that are still there after a delete. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly remaining: string[] = [],
  ) {
    super(message);
    this.name = "StorageError";
  }
}

const PAGE = 1000;
const CHUNK = 100;

/**
 * The signed-in user's client by default, so storage policies apply. Tests against a
 * real Supabase project pass their own.
 */
type Client = Pick<SupabaseClient, "storage">;
const clientOr = async (c?: Client) => c ?? (await createSupabaseServerClient());

/** Short-lived links to private files. Missing files come back without a URL. */
export async function signedUrls(bucket: string, paths: string[], expiresIn = 3600) {
  if (!paths.length || !storageEnabled()) return new Map<string, string>();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw new StorageError(`Couldn't create photo links: ${error.message}`);
  return new Map(
    (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]),
  );
}

/** Every file directly inside a folder (photos are stored flat, one folder per user). */
export async function listFolder(
  bucket: string,
  folder: string,
  client?: Client,
): Promise<StoredFile[]> {
  if (!client && !storageEnabled()) return [];
  const supabase = await clientOr(client);
  const out: StoredFile[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new StorageError(`Couldn't list stored files: ${error.message}`);
    const files = (data ?? []).filter((f) => f.id); // folders come back without an id
    out.push(
      ...files.map((f) => ({
        path: `${folder}/${f.name}`,
        createdAt: f.created_at ? new Date(f.created_at) : null,
      })),
    );
    if ((data ?? []).length < PAGE) return out;
  }
}

/**
 * Deletes files and confirms they are gone. Supabase's remove() reports failures in its
 * return value rather than throwing, so the error is checked, and the folder is listed
 * afterwards: anything still there is reported, never assumed deleted.
 */
export async function removeFiles(bucket: string, paths: string[], client?: Client) {
  if (!paths.length || (!client && !storageEnabled())) return;
  const supabase = await clientOr(client);
  let lastError: string | null = null;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
    if (error) lastError = error.message;
  }
  const folders = [...new Set(paths.map((p) => p.split("/").slice(0, -1).join("/")))];
  const wanted = new Set(paths);
  const remaining: string[] = [];
  for (const folder of folders) {
    for (const f of await listFolder(bucket, folder, supabase)) {
      if (wanted.has(f.path)) remaining.push(f.path);
    }
  }
  if (remaining.length) {
    throw new StorageError(
      `${remaining.length} file${remaining.length === 1 ? " was" : "s were"} not deleted` +
        (lastError ? ` (${lastError})` : ""),
      remaining,
    );
  }
  // A call that errored but left nothing behind (say, a timeout after the delete went
  // through) is fine: the listing is the proof.
}

/**
 * Deletes everything in a folder, including files the database no longer knows about,
 * then checks the folder is empty. Used when an account is deleted.
 */
export async function emptyFolder(bucket: string, folder: string, client?: Client) {
  if (!client && !storageEnabled()) return 0;
  const supabase = await clientOr(client);
  let removed = 0;
  for (let round = 0; round < 5; round++) {
    const files = await listFolder(bucket, folder, supabase);
    if (!files.length) return removed;
    await removeFiles(
      bucket,
      files.map((f) => f.path),
      supabase,
    );
    removed += files.length;
  }
  const left = await listFolder(bucket, folder, supabase);
  if (left.length) {
    throw new StorageError(
      `${left.length} files are still stored`,
      left.map((f) => f.path),
    );
  }
  return removed;
}

/**
 * Removes uploads that never got a database row (the upload worked, saving the row
 * didn't). Recent files are left alone, as their row may still be on its way.
 */
export async function removeOrphanedFiles(bucket: string, folder: string, known: string[]) {
  const orphans = orphanedFiles(await listFolder(bucket, folder), known, new Date());
  if (orphans.length) await removeFiles(bucket, orphans);
  return orphans.length;
}
