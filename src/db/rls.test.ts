import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
    await sql`insert into muscle_groups (slug, name, region) values ('chest', 'Chest', 'upper')`;
    await sql`insert into exercises (slug, name, category) values ('bench-press', 'Bench press', 'resistance')`;
  });

  afterAll(async () => {
    await sql.end();
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
      const [bench] = await tx`select id from exercises where slug = 'bench-press'`;
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
    const aliceNames = await asUser(alice, (tx) => tx`select name from exercises order by name`);
    expect(aliceNames.map((r) => r.name)).toEqual(["Bench press", "My cable fly"]);
    const bobNames = await asUser(bob, (tx) => tx`select name from exercises`);
    expect(bobNames.map((r) => r.name)).toEqual(["Bench press"]);
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
          tx`insert into body_metrics (user_id, type, value) values (${alice}, 'body_fat', 90)`,
      ),
    ).rejects.toThrow(/body_metrics_body_fat_range/);
  });

  it("deletes a user's data when their account is deleted", async () => {
    await sql`delete from auth.users where id = ${alice}`;
    const [{ count }] = await sql`select count(*)::int as count from workout_sets`;
    expect(count).toBe(0);
  });
});
