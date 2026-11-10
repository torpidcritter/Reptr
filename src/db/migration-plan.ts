import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Reads the migration journal and compares it with what a database has recorded, so
// production can be checked and upgraded one known step at a time.

export type JournalEntry = { idx: number; when: number; tag: string };
export type AppliedRow = { hash: string; created_at: string | number };
export type MigrationState = {
  tag: string;
  when: number;
  hash: string;
  status: "applied" | "pending" | "changed";
};

export function readJournal(folder = "src/db/migrations"): JournalEntry[] {
  const raw = readFileSync(join(folder, "meta/_journal.json"), "utf8");
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

export function fileHash(folder: string, tag: string) {
  return createHash("sha256")
    .update(readFileSync(join(folder, `${tag}.sql`), "utf8"))
    .digest("hex");
}

/**
 * Drizzle applies every journal entry newer than the newest recorded one, so an entry is
 * applied when a row with its timestamp exists. "changed" means the file was edited after
 * it was applied, which must never happen to a released migration.
 */
export function planMigrations(
  entries: JournalEntry[],
  applied: AppliedRow[],
  hashOf: (tag: string) => string,
): MigrationState[] {
  const byWhen = new Map(applied.map((r) => [Number(r.created_at), r.hash]));
  return entries.map((e) => {
    const hash = hashOf(e.tag);
    const recorded = byWhen.get(e.when);
    const status = recorded === undefined ? "pending" : recorded === hash ? "applied" : "changed";
    return { tag: e.tag, when: e.when, hash, status };
  });
}

/** Entries to keep so that migrating stops after `tag`; refuses a step backwards. */
export function entriesUpTo(entries: JournalEntry[], states: MigrationState[], tag: string) {
  const end = entries.findIndex((e) => e.tag === tag || e.tag.startsWith(`${tag}_`));
  if (end < 0) throw new Error(`No migration called ${tag}`);
  const laterApplied = states.slice(end + 1).find((s) => s.status !== "pending");
  if (laterApplied) {
    throw new Error(`${laterApplied.tag} is already applied, so the database is past ${tag}`);
  }
  return entries.slice(0, end + 1);
}
