import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../schema";
import { seed } from "../seed/seed";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/**
 * Creates a fresh, migrated and seeded database for one test file, so test files
 * can run in parallel. Needs TEST_DATABASE_URL pointing at a throwaway Postgres.
 */
export async function createTestDatabase(name: string) {
  const base = new URL(testDatabaseUrl!);
  const dbName = `${base.pathname.slice(1)}_${name}`;
  const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  const url = new URL(base);
  url.pathname = `/${dbName}`;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync("src/db/test/supabase-shim.sql", "utf8"));
  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  await seed(sql);

  return {
    sql,
    db,
    async addUser(id: string) {
      await sql`insert into auth.users (id, email) values (${id}, ${id + "@test"})`;
    },
    close: () => sql.end(),
  };
}
