// Pure rules for stored files, kept apart from the Supabase calls so they can be tested.

export type StoredFile = { path: string; createdAt: Date | null };

/** How long an upload may wait for its database row before it counts as abandoned. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/** Files with no database row that are old enough to be sure the row is never coming. */
export function orphanedFiles(files: StoredFile[], known: string[], now: Date) {
  const keep = new Set(known);
  return files
    .filter((f) => !keep.has(f.path))
    .filter((f) => f.createdAt && now.getTime() - f.createdAt.getTime() > ORPHAN_GRACE_MS)
    .map((f) => f.path);
}
