import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seed } from "../src/db/seed/seed";
import { e2eDatabaseUrl, e2eUserId, freshUserId, otherUserId } from "./env";

/** A fresh database with the exercise library and one onboarded user. */
export default async function globalSetup() {
  const url = new URL(e2eDatabaseUrl);
  const name = url.pathname.slice(1);
  const admin = postgres({ ...pgOptions(url), database: "postgres" });
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync("src/db/test/supabase-shim.sql", "utf8"));
  await migrate(drizzle(sql), { migrationsFolder: "src/db/migrations" });
  await seed(sql);
  await sql`insert into auth.users (id, email) values (${e2eUserId}, 'e2e@test')`;
  await sql`insert into profiles (user_id, display_name, unit_system, goal, onboarded_at)
            values (${e2eUserId}, 'Sam', 'metric', 'all_round', now())
            on conflict (user_id) do update set display_name = 'Sam', onboarded_at = now()`;
  await sql`insert into auth.users (id, email) values (${freshUserId}, 'fresh@test'), (${otherUserId}, 'other@test')`;
  await sql`update profiles set display_name = 'Robin', onboarded_at = now() where user_id = ${otherUserId}`;
  await sql`insert into profiles (user_id, display_name, onboarded_at)
            select ${otherUserId}, 'Robin', now() where not exists
            (select 1 from profiles where user_id = ${otherUserId})`;
  await sql`insert into workouts (user_id, name, status, started_at, finished_at)
            values (${otherUserId}, 'Robin private session', 'completed', now() - interval '1 day', now() - interval '23 hours')`;
  await sql`insert into body_metrics (user_id, type, value, recorded_at)
            values (${otherUserId}, 'weight', 111.1, now() - interval '1 day')`;
  await sql.end();
}

function pgOptions(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    onnotice: () => {},
  };
}
