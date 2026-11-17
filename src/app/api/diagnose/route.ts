import { connection, type NextRequest } from "next/server";
import { db } from "@/db";
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
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        step,
        ms: Math.round(performance.now() - start),
        ok: false,
        note: message.slice(0, 300),
      });
      log.error("diagnose_step_failed", { step, err });
      return undefined;
    }
  };

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
