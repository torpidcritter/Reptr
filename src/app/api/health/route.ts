import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { log } from "@/lib/log";

/**
 * For uptime monitoring: 200 when the app can reach its database, 503 when it can't.
 * Says nothing about any user and is never cached.
 */
export async function GET() {
  await connection();
  const start = performance.now();
  try {
    await db.execute(sql`select 1`);
    const dbMs = Math.round(performance.now() - start);
    return Response.json(
      { ok: true, dbMs, build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    log.error("health_db_unreachable", { err });
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
