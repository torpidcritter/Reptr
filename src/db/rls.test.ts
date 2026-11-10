import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "./seed/seed";

// Runs against a throwaway local Postgres: TEST_DATABASE_URL=postgres://... pnpm test
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database schema and row-level security", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const alice = randomUUID();
  const bob = randomUUID();

  /** Runs queries as a signed-in Supabase user, the way PostgREST does. */
  async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    }) as Promise<T>;
  }

  beforeAll(async () => {
    await sql`drop schema if exists public cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
    await sql.unsafe(readFileSync("src/db/test/supabase-shim.sql", "utf8"));
    await migrate(drizzle(sql), { migrationsFolder: "src/db/migrations" });
    await sql`insert into auth.users (id, email) values (${alice}, 'alice@test'), (${bob}, 'bob@test')`;
    await seed(sql);
  });

  afterAll(async () => {
    await sql.end();
  });

  it("creates a profile when someone signs up", async () => {
    const rows =
      await sql`select user_id, unit_system, goal, onboarded_at from profiles order by user_id`;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ unit_system: "metric", goal: "all_round", onboarded_at: null });
    const own = await asUser(alice, (tx) => tx`select user_id from profiles`);
    expect(own.map((r) => r.user_id)).toEqual([alice]);
  });

  it("enables row-level security on every table", async () => {
    const rows = await sql`
      select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("lets a user log a workout and keeps it private from others", async () => {
    const workoutId = randomUUID();
    const weId = randomUUID();

    await asUser(alice, async (tx) => {
      const [bench] = await tx`select id from exercises where slug = 'barbell-bench-press'`;
      await tx`insert into workouts (id, user_id, name) values (${workoutId}, ${alice}, 'Push')`;
      await tx`insert into workout_exercises (id, user_id, workout_id, exercise_id, position)
               values (${weId}, ${alice}, ${workoutId}, ${bench.id}, 1)`;
      await tx`insert into workout_sets (user_id, workout_exercise_id, set_number, weight_kg, reps)
               values (${alice}, ${weId}, 1, 60, 8)`;
    });

    const bobSees = await asUser(bob, (tx) => tx`select id from workouts`);
    expect(bobSees).toHaveLength(0);
    const bobSets = await asUser(bob, (tx) => tx`select id from workout_sets`);
    expect(bobSets).toHaveLength(0);

    const aliceSets = await asUser(alice, (tx) => tx`select weight_kg, reps from workout_sets`);
    expect(aliceSets).toEqual([{ weight_kg: "60.000", reps: 8 }]);
  });

  it("blocks writing rows on behalf of another user", async () => {
    await expect(
      asUser(bob, (tx) => tx`insert into workouts (user_id, name) values (${alice}, 'Sneaky')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks attaching a set to another user's workout", async () => {
    const [we] = await sql`select id from workout_exercises limit 1`;
    await expect(
      asUser(
        bob,
        (tx) =>
          tx`insert into workout_sets (user_id, workout_exercise_id, set_number, reps)
           values (${bob}, ${we.id}, 2, 5)`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("allows only one workout in progress per user", async () => {
    await expect(
      asUser(alice, (tx) => tx`insert into workouts (user_id, name) values (${alice}, 'Second')`),
    ).rejects.toThrow(/workouts_one_in_progress_idx/);
  });

  it("shares built-in exercises but keeps custom ones private", async () => {
    await asUser(
      alice,
      (tx) =>
        tx`insert into exercises (owner_id, name, category) values (${alice}, 'My cable fly', 'resistance')`,
    );
    const custom = (rows: postgres.RowList<postgres.Row[]>) =>
      rows.map((r) => r.name as string).filter((n) => n === "My cable fly");
    const aliceNames = await asUser(alice, (tx) => tx`select name from exercises`);
    expect(custom(aliceNames)).toEqual(["My cable fly"]);
    const bobNames = await asUser(bob, (tx) => tx`select name from exercises`);
    expect(custom(bobNames)).toEqual([]);
    expect(bobNames.length).toBeGreaterThanOrEqual(150);
  });

  it("does not let users edit built-in exercises or reference data", async () => {
    const updated = await asUser(
      bob,
      (tx) => tx`update exercises set name = 'Hacked' where owner_id is null returning id`,
    );
    expect(updated).toHaveLength(0);
    await expect(
      asUser(
        bob,
        (tx) => tx`insert into muscle_groups (slug, name, region) values ('x', 'X', 'upper')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects impossible values", async () => {
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`insert into body_metrics (user_id, type, value, recorded_on) values (${alice}, 'body_fat', 90, current_date)`,
      ),
    ).rejects.toThrow(/body_metrics_body_fat_range/);
  });

  it("seeds the library and can be re-run safely", async () => {
    const before = await sql`select count(*)::int as n from exercise_muscles`;
    await seed(sql);
    const after = await sql`select count(*)::int as n from exercise_muscles`;
    expect(after[0].n).toBe(before[0].n);
    const [{ n }] = await sql`
      select count(*)::int as n from exercises e
      where e.owner_id is null and not exists (
        select 1 from exercise_muscles m where m.exercise_id = e.id and m.role = 'primary')
        and e.category in ('resistance', 'bodyweight')`;
    expect(n).toBe(0);
  });

  it("never lets anyone use another person's private exercise, even the server", async () => {
    const [mine] = await sql`
      insert into exercises (owner_id, name, category) values (${alice}, 'Alice private press', 'resistance')
      returning id`;
    const [w] = await sql`
      insert into workouts (user_id, name, status, finished_at) values (${bob}, 'Bob', 'completed', now())
      returning id`;
    await expect(
      sql`insert into workout_exercises (user_id, workout_id, exercise_id, position)
          values (${bob}, ${w.id}, ${mine.id}, 0)`,
    ).rejects.toThrow(/not available to this user/);
    await expect(
      sql`insert into goals (user_id, kind, exercise_id, target_value) values (${bob}, 'strength', ${mine.id}, 100)`,
    ).rejects.toThrow(/not available to this user/);
    await sql`delete from workouts where id = ${w.id}`;
  });

  it("only links a workout to its owner's routine, and keeps the workout when the routine goes", async () => {
    const [r] =
      await sql`insert into routines (user_id, name) values (${alice}, 'Alice plan') returning id`;
    await expect(
      sql`insert into workouts (user_id, routine_id, name, status, finished_at)
          values (${bob}, ${r.id}, 'Bob', 'completed', now())`,
    ).rejects.toThrow(/workouts_routine_fk/);
    const [w] = await sql`
      insert into workouts (user_id, routine_id, name, status, finished_at)
      values (${alice}, ${r.id}, 'From plan', 'completed', now()) returning id`;
    await sql`delete from routines where id = ${r.id}`;
    const [after] = await sql`select routine_id, user_id from workouts where id = ${w.id}`;
    expect(after).toEqual({ routine_id: null, user_id: alice });
  });

  it("counts photos toward each person's limit, only in their own folder", async () => {
    // Supabase Storage isn't installed here; a minimal stand-in has the columns used.
    await sql.unsafe(`
      create schema if not exists storage;
      create table if not exists storage.objects (bucket_id text, name text);
      create or replace function storage.foldername(name text) returns text[]
        language sql immutable as $$ select string_to_array(name, '/') $$;`);
    await sql`insert into storage.objects values
      ('progress-photos', ${alice + "/a.jpg"}), ('progress-photos', ${alice + "/b.jpg"}),
      ('progress-photos', ${bob + "/c.jpg"}), ('other-bucket', ${alice + "/d.jpg"})`;
    const left = async (id: string) =>
      (await sql`select public.photo_quota_left(${id}) as n`)[0].n as number;
    expect(await left(alice)).toBe(298);
    expect(await left(bob)).toBe(299);
    await sql.unsafe("drop schema storage cascade");
  });

  it("indexes every foreign key, so deletes never scan a whole table", async () => {
    // A foreign key is covered when some index starts with its column, or for a
    // composite key, with one of its columns other than user_id (which alone narrows
    // the rows to check).
    const rows = await sql`
      select c.conrelid::regclass::text as tbl, c.conname as name
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
          where i.indrelid = c.conrelid and i.indkey[0] = any (c.conkey)
            and (cardinality(c.conkey) = 1 or a.attname <> 'user_id')
        )
      order by 1, 2`;
    // Equipment is fixed reference data that's never deleted.
    expect(rows.map((r) => `${r.tbl}.${r.name}`)).toEqual([
      "exercises.exercises_equipment_id_equipment_id_fk",
    ]);
  });

  it("deletes a user's data when their account is deleted", async () => {
    await sql`delete from auth.users where id = ${alice}`;
    const [{ count }] = await sql`select count(*)::int as count from workout_sets`;
    expect(count).toBe(0);
  });
});
