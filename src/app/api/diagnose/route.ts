import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
