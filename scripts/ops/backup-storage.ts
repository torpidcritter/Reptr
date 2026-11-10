// Copies every progress photo out of Supabase Storage into a local folder, so photos are
// covered by a backup too (Supabase database backups don't include Storage files).
//
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   the project; the service key reads every folder
//   BACKUP_DIR                                where to write (default ./backups/photos-<date>)
//
// Run: corepack pnpm tsx scripts/ops/backup-storage.ts
// Existing files with the same size are skipped, so re-running only fetches what's new.
// The output is personal data: keep it encrypted at rest, and never commit it.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "progress-photos";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const out =
  process.env.BACKUP_DIR ?? join("backups", `photos-${new Date().toISOString().slice(0, 10)}`);
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function list(prefix: string) {
  const items: { name: string; id: string | null; metadata: { size?: number } | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset });
    if (error) throw error;
    items.push(...(data ?? []));
    if ((data ?? []).length < 1000) return items;
  }
}

let copied = 0;
let skipped = 0;
for (const folder of await list("")) {
  if (folder.id) continue; // top level holds one folder per user
  for (const file of await list(folder.name)) {
    if (!file.id) continue;
    const path = `${folder.name}/${file.name}`;
    const dest = join(out, path);
    const size = file.metadata?.size;
    const existing = await stat(dest).catch(() => null);
    if (existing && size != null && existing.size === size) {
      skipped++;
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) throw new Error(`Couldn't download ${path}: ${error.message}`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await data.arrayBuffer()));
    copied++;
  }
}
console.log(`Photos backed up to ${out}: ${copied} copied, ${skipped} unchanged.`);
