import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "./seed/seed";
import { testDatabaseUrl } from "./test/test-db";

// New migrations must upgrade a database that already holds people's data, not just an
// empty one. This builds the schema as it was at the last release, fills it with data
// shaped the way that release wrote it, then applies every newer migration.

/** The last migration live in production before the hardening work. */
const RELEASED = "0019_optional_modules";

type Journal = { entries: { tag: string }[] };

function migrationsUpTo(tag: string) {
  const dir = mkdtempSync(join(tmpdir(), "reptr-migrations-"));
  cpSync("src/db/migrations", dir, { recursive: true });
  const path = join(dir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(path, "utf8")) as Journal;
  const end = journal.entries.findIndex((e) => e.tag === tag);
  if (end < 0) throw new Error(`No migration ${tag}`);
  journal.entries = journal.entries.slice(0, end + 1);
  writeFileSync(path, JSON.stringify(journal));
  return dir;
}

describe.skipIf(!testDatabaseUrl)("migrations on a populated database", () => {
  let sql: postgres.Sql;
  let old: string;
  const alice = randomUUID();
  const bob = randomUUID();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const base = new URL(testDatabaseUrl!);
    const name = `${base.pathname.slice(1)}_upgrade`;
    const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
    await admin.end();
    base.pathname = `/${name}`;
    sql = postgres(base.toString(), { max: 1, onnotice: () => {} });
    await sql.unsafe(readFileSync("src/db/test/supabase-shim.sql", "utf8"));

    old = migrationsUpTo(RELEASED);
    await migrate(drizzle(sql), { migrationsFolder: old });
    await seed(sql);
    await sql`insert into auth.users (id, email) values (${alice}, 'a@test'), (${bob}, 'b@test')`;

    // Weigh-ins as the old code stored them: wall-clock time written as if it were UTC.
    await sql`insert into body_metrics (user_id, type, value, recorded_at) values
      (${alice}, 'weight', 80, '2026-11-01T07:45:00Z'),
      (${alice}, 'weight', 79.5, '2026-11-02T12:00:00Z')`;
    // A workout the old code let point at someone else's routine.
    const [r] =
      await sql`insert into routines (user_id, name) values (${bob}, 'Bob plan') returning id`;
    const [w] = await sql`
      insert into workouts (user_id, routine_id, name, status, finished_at)
      values (${alice}, ${r.id}, 'Linked wrongly', 'completed', now()) returning id`;
    const [ok] =
      await sql`insert into routines (user_id, name) values (${alice}, 'Alice plan') returning id`;
    const [w2] = await sql`
      insert into workouts (user_id, routine_id, name, status, finished_at)
      values (${alice}, ${ok.id}, 'Linked right', 'completed', now()) returning id`;
    Object.assign(ids, { wrong: w.id, right: w2.id, aliceRoutine: ok.id });

    await migrate(drizzle(sql), { migrationsFolder: "src/db/migrations" });
  });

  afterAll(async () => {
    await sql?.end();
    if (old) rmSync(old, { recursive: true, force: true });
  });

  it("applies every newer migration", async () => {
    const journal = JSON.parse(
      readFileSync("src/db/migrations/meta/_journal.json", "utf8"),
    ) as Journal;
    const [{ count }] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
    expect(count).toBe(journal.entries.length);
  });

  it("keeps each weigh-in on the day and time the person saw", async () => {
    const rows = await sql`
      select value::float as value, recorded_on::text as day, recorded_time::text as time
      from body_metrics where user_id = ${alice} order by recorded_on`;
    expect(rows).toEqual([
      { value: 80, day: "2026-11-01", time: "07:45:00" },
      { value: 79.5, day: "2026-11-02", time: null },
    ]);
  });

  it("unlinks a workout from someone else's routine but keeps the workout", async () => {
    const rows =
      await sql`select id, routine_id from workouts where user_id = ${alice} order by name`;
    expect(rows).toEqual([
      { id: ids.right, routine_id: ids.aliceRoutine },
      { id: ids.wrong, routine_id: null },
    ]);
  });
});
