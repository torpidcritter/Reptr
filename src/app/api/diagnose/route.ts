import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { connection, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getProfile, getTimeZone } from "@/lib/auth";
import { IDENTITY_COOKIE } from "@/lib/identity-cookie";
import { log } from "@/lib/log";
import { fatigueFor } from "@/modules/coach/fatigue-queries";
import { unreadCount } from "@/modules/community/notifications";
import { nextRoutine } from "@/modules/dashboard/dashboard";
import { listWorkoutHistory } from "@/modules/history/history";
import { userForToken } from "@/modules/profile/identity";
import { listRoutines } from "@/modules/routines/routines";
import { deviceKey } from "@/modules/sync/device-key";

/**
 * For finding why a page won't load in production: runs, one by one, the steps a page
 * takes for the profile on this browser and says how long each took and whether it
 * failed. Reports only timings, yes/no answers and error messages, never anyone's data.
 */
export async function GET(request: NextRequest) {
  await connection();
  const steps: { step: string; ms: number; ok: boolean; note?: string }[] = [];
  const run = async <T>(step: string, fn: () => Promise<T>, note?: (v: T) => string) => {
    const start = performance.now();
    try {
      const v = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("no answer after 8 s")), 8000),
        ),
      ]);
      steps.push({ step, ms: Math.round(performance.now() - start), ok: true, note: note?.(v) });
      return v;
    } catch (err) {
      // The database's own reason, without the query's parameters (they hold ids).
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
      const message = (err instanceof Error ? err.message : String(err)).split("\nparams:")[0];
      steps.push({
        step,
        ms: Math.round(performance.now() - start),
        ok: false,
        note: (cause ? `${cause} | ${message}` : message).slice(0, 400),
      });
      log.error("diagnose_step_failed", { step, err });
      return undefined;
    }
  };

  await run(
    "database tables",
    () => missingColumns(),
    (missing) => (missing.length ? `missing: ${missing.join(", ")}` : "all present"),
  );

  await run(
    "stuck database work",
    () => stuckWork(),
    (v) => v,
  );

  const token = request.cookies.get(IDENTITY_COOKIE)?.value;
  const userId = await run(
    "profile cookie",
    () => userForToken(db, token),
    (id) => (token ? (id ? "valid" : "cookie present but not recognised") : "no cookie"),
  );
  if (userId) {
    await run(
      "profile",
      () => getProfile(userId),
      (p) =>
        `username ${p?.username ? "set" : "missing"}, onboarded ${p?.onboardedAt ? "yes" : "no"}`,
    );
    const tz = (await run("time zone", () => getTimeZone())) ?? "UTC";
    await run("device key", () => deviceKey(db, userId));
    await run("unread notifications", () => unreadCount(db, userId));
    await run("next routine", () => nextRoutine(db, userId, 0));
    await run("routines", () => listRoutines(db, userId));
    await run("workout history", () => listWorkoutHistory(db, userId, { limit: 1 }));
    await run("fatigue", () => fatigueFor(db, userId, tz));
  }
  if (request.nextUrl.searchParams.has("burst")) {
    await run(
      "connection setup",
      async () => connectionSetup(),
      (v) => v,
    );
    await run(
      "20 connections at once",
      () => burst(20),
      (v) => v,
    );
  }
  return Response.json(
    {
      build: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
      region: process.env.VERCEL_REGION ?? null,
      steps,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Tables and columns the app expects that the database doesn't have. */
async function missingColumns() {
  const rows = await db.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const have = new Set(Array.from(rows).map((r) => `${r.table_name}.${r.column_name}`));
  const tables = new Set(Array.from(rows).map((r) => r.table_name));
  const missing: string[] = [];
  for (const value of Object.values(schema)) {
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    if (!config?.name || !Array.isArray(config.columns) || config.schema) continue;
    if (!tables.has(config.name)) {
      missing.push(`table ${config.name}`);
      continue;
    }
    for (const c of config.columns) {
      if (!have.has(`${config.name}.${c.name}`)) missing.push(`${config.name}.${c.name}`);
    }
  }
  return missing;
}

/** Which kind of connection the app uses (never the password or the full address). */
function connectionSetup() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://unset");
  const pooler = url.hostname.includes("pooler.supabase.com");
  return `port ${url.port || "5432"}, ${pooler ? "Supabase pooler" : "direct"}${
    pooler ? (url.port === "6543" ? " (transaction mode)" : " (session mode)") : ""
  }`;
}

/**
 * Opens `n` connections at once, as several pages loading together would, and reports
 * how many failed and why. Its own short-lived client, closed straight after.
 */
async function burst(n: number) {
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: n,
    connect_timeout: 10,
  });
  try {
    const results = await Promise.allSettled(
      Array.from({ length: n }, () => client`select pg_sleep(0.3)`),
    );
    const errors = results.flatMap((r) =>
      r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : [],
    );
    const reasons = [...new Set(errors)].join("; ").slice(0, 300);
    return errors.length ? `${errors.length} of ${n} failed: ${reasons}` : `all ${n} worked`;
  } finally {
    await client.end({ timeout: 2 });
  }
}

/**
 * Database sessions that are stuck: waiting on a lock, or holding a transaction open
 * for over 10 seconds. Shows only their state, wait reason, age and the first words of
 * the statement, never its values.
 */
async function stuckWork() {
  const rows = await db.execute<{
    state: string;
    wait: string | null;
    age: number;
    query: string;
  }>(sql`
    select state, wait_event_type || ':' || wait_event as wait,
           extract(epoch from now() - coalesce(xact_start, query_start))::int as age,
           left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 60) as query
    from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
      and (wait_event_type = 'Lock'
           or (xact_start is not null and now() - xact_start > interval '10 seconds'))
    order by age desc limit 8`);
  const list = Array.from(rows);
  if (!list.length) return "none";
  return list.map((r) => `${r.state} ${r.age}s ${r.wait ?? ""} ${r.query}`).join(" | ");
}
