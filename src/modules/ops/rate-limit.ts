import { sql } from "drizzle-orm";
import type { Database } from "@/db";
import { rateLimits } from "@/db/schema";

/** Each limit: how many calls fit in the window. Per user unless the key says otherwise. */
export const limits = {
  /** AI coach answers cost money, so they're the tightest. */
  coach: { max: 20, windowSec: 10 * 60 },
  coachDaily: { max: 150, windowSec: 24 * 3600 },
  /** Ordinary saves: generous enough for logging a fast workout set by set. */
  write: { max: 600, windowSec: 10 * 60 },
  photo: { max: 30, windowSec: 3600 },
  export: { max: 10, windowSec: 3600 },
  /** Sign-in emails, keyed by address. */
  login: { max: 5, windowSec: 15 * 60 },
  /** Sign-in emails from one network address, so one client can't mail many people. */
  loginIp: { max: 20, windowSec: 60 * 60 },
  /** Guesses at the six-digit sign-in code, keyed by address. */
  loginCode: { max: 8, windowSec: 15 * 60 },
  clientError: { max: 30, windowSec: 10 * 60 },
  accountDelete: { max: 3, windowSec: 3600 },
  /** Social: follows and requests, posts, likes, comments, reports. */
  follow: { max: 60, windowSec: 3600 },
  post: { max: 30, windowSec: 3600 },
  like: { max: 300, windowSec: 3600 },
  comment: { max: 60, windowSec: 10 * 60 },
  report: { max: 20, windowSec: 24 * 3600 },
  search: { max: 120, windowSec: 10 * 60 },
} as const;

export type LimitName = keyof typeof limits;

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Counts one call against `name` for `subject` and says whether it's within the limit. */
export async function hit(db: Database, name: LimitName, subject: string): Promise<RateResult> {
  const { max, windowSec } = limits[name];
  const key = `${name}:${subject}`;
  const stale = sql`${rateLimits.windowStart} <= now() - make_interval(secs => ${windowSec})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${stale} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${stale} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({
      count: rateLimits.count,
      left: sql<number>`extract(epoch from ${rateLimits.windowStart} + make_interval(secs => ${windowSec}) - now())::float`,
    });
  // Now and then, clear out counters nobody has used for days.
  if (Math.random() < 0.01) pruneRateLimits(db).catch(() => {});
  if (row.count <= max) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil(row.left)) };
}

/** A short, human wait time: "in 40 seconds", "in 7 minutes", "in 3 hours". */
export function waitText(sec: number) {
  if (sec < 90) return `in ${sec} seconds`;
  if (sec < 90 * 60) return `in ${Math.ceil(sec / 60)} minutes`;
  return `in ${Math.ceil(sec / 3600)} hours`;
}

/** Deletes counters whose window ended over a day ago. Safe to run any time. */
export async function pruneRateLimits(db: Database) {
  await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < now() - interval '2 days'`);
}
