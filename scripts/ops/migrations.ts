/**
 * Check or upgrade a database one known step at a time.
 *
 *   pnpm db:status                       what is applied, pending or edited
 *   pnpm db:migrate:to 0028 --yes        apply pending migrations up to 0028, then stop
 *
 * Needs DATABASE_URL (Supabase session pooler or direct connection, port 5432). It never
 * prints the URL. See docs/ops/DEPLOYMENT.md for the production order.
 */
import "dotenv/config";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  entriesUpTo,
  fileHash,
  planMigrations,
  readJournal,
  type MigrationState,
} from "../../src/db/migration-plan";

const folder = "src/db/migrations";

// One object per migration that must exist once it is applied, so a recorded migration
// whose objects are missing is caught too.
const sentinels: Record<string, string> = {
  "0020_fk_indexes": "select to_regclass('public.personal_records_set_idx') is not null as ok",
  "0021_coach_usage": "select to_regclass('public.coach_usage') is not null as ok",
  "0022_body_metric_days":
    "select to_regclass('public.body_metrics_user_type_day_idx') is not null as ok",
  "0023_ownership_checks":
    "select exists (select 1 from pg_proc where proname = 'exercise_visible_to_owner') as ok",
  "0024_photo_quota":
    "select exists (select 1 from pg_proc where proname = 'photo_quota_left') as ok",
  "0025_exercise_fk_indexes":
    "select to_regclass('public.routine_exercises_exercise_idx') is not null as ok",
  "0026_social_functions":
    "select exists (select 1 from pg_proc where proname = 'social_can_see') as ok",
  "0027_social_tables": "select to_regclass('public.blocks') is not null as ok",
  "0028_social_rules": "select to_regclass('public.profile_cards') is not null as ok",
  "0029_community_functions":
    "select exists (select 1 from pg_proc where proname = 'leaderboard') as ok",
  "0030_community_tables": "select to_regclass('public.notifications') is not null as ok",
  "0032_beta_readiness": "select to_regclass('public.device_keys') is not null as ok",
  "0033_progress_board":
    "select pg_get_functiondef('public.fitness_scores(text,timestamptz,timestamptz,uuid[])'::regprocedure) like '%records%' as ok",
  "0034_profile_identity": "select to_regclass('public.identity_tokens') is not null as ok",
  "0031_community_rules":
    "select exists (select 1 from pg_trigger where tgname = 'groups_add_owner') as ok",
};

async function states(sql: postgres.Sql) {
  const [{ exists }] =
    await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  const applied = exists
    ? await sql<
        { hash: string; created_at: string }[]
      >`select hash, created_at from drizzle.__drizzle_migrations`
    : [];
  return planMigrations(readJournal(folder), applied, (tag) => fileHash(folder, tag));
}

async function report(sql: postgres.Sql, list: MigrationState[]) {
  let problems = 0;
  for (const s of list) {
    let note = "";
    const check = sentinels[s.tag];
    if (check && s.status === "applied") {
      const [{ ok }] = await sql.unsafe(check);
      if (!ok) {
        note = "  <- recorded but its objects are missing";
        problems++;
      }
    }
    if (s.status === "changed") {
      note = "  <- file differs from what was applied";
      problems++;
    }
    console.log(`${s.status.padEnd(8)} ${s.tag}${note}`);
  }
  const pending = list.filter((s) => s.status === "pending").length;
  console.log(`\n${list.length - pending} applied, ${pending} pending, ${problems} problems.`);
  return problems;
}

async function main() {
  const [command, target] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL first.");
  if (new URL(url).port === "6543") {
    throw new Error("Use the session pooler or direct connection (port 5432), not 6543.");
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const list = await states(sql);
    if (command === "status") {
      process.exitCode = (await report(sql, list)) ? 1 : 0;
      return;
    }
    if (command !== "to" || !target) {
      throw new Error("Usage: migrations.ts status | migrations.ts to <tag> --yes");
    }
    const keep = entriesUpTo(readJournal(folder), list, target);
    const todo = list.slice(0, keep.length).filter((s) => s.status === "pending");
    if (list.some((s) => s.status === "changed"))
      throw new Error("An applied migration was edited. Stopping.");
    if (todo.length === 0) {
      console.log(`Nothing to do: everything up to ${keep.at(-1)!.tag} is applied.`);
      return;
    }
    console.log(`Will apply, in one run:\n${todo.map((s) => `  ${s.tag}`).join("\n")}`);
    if (!process.argv.includes("--yes")) {
      console.log("\nTake a backup first. Then run again with --yes to apply.");
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "reptr-migrate-"));
    try {
      cpSync(folder, dir, { recursive: true });
      writeFileSync(
        join(dir, "meta/_journal.json"),
        JSON.stringify({ version: "7", dialect: "postgresql", entries: keep }),
      );
      await migrate(drizzle(sql), { migrationsFolder: dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    console.log("Applied. Status now:\n");
    process.exitCode = (await report(sql, await states(sql))) ? 1 : 0;
  } finally {
    await sql.end();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
