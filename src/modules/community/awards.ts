import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { challengeMembers, challenges, userBadges, userLevels } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { log } from "@/lib/log";
import { milestones } from "@/modules/achievements/milestones";
import { weekOf } from "@/modules/analytics/insights";
import { notify } from "./notifications";
import { levelFor } from "./scoring";

// XP, levels, badges and challenge completions, worked out from the saved workouts that
// count (see public.fitness_workouts). Safe to run any number of times: each award is
// stored once, so running it again changes nothing. Run after a workout is finished,
// corrected or deleted, and when the person opens their achievements.

/** Badges reached long ago (first run for an existing account) are added quietly. */
const NOTIFY_WITHIN_DAYS = 7;

type Counted = { finished_at: string; volume: string; xp: number };

export async function countedWorkouts(db: Database, userId: string) {
  const rows = await db.execute<Counted>(sql`
    select finished_at, volume, xp
    from public.fitness_workouts('-infinity', 'infinity', array[${userId}]::uuid[])
    order by finished_at`);
  return rows.map((r) => ({
    day: new Date(r.finished_at).toISOString().slice(0, 10),
    volumeKg: Number(r.volume),
    xp: r.xp,
  }));
}

export async function syncAwards(db: Database, userId: string) {
  const workouts = await countedWorkouts(db, userId);
  const xp = workouts.reduce((n, w) => n + w.xp, 0);
  const { level } = levelFor(xp);

  // Level: notice a rise once.
  const levelUp = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(userLevels)
      .where(eq(userLevels.userId, userId))
      .for("update");
    await tx
      .insert(userLevels)
      .values({ userId, xp, level })
      .onConflictDoUpdate({
        target: userLevels.userId,
        set: { xp, level, updatedAt: new Date() },
      });
    return before && level > before.level ? level : null;
  });
  if (levelUp) {
    await notify(db, userId, {
      kind: "level_up",
      data: { level: levelUp },
      dedupeKey: `level:${levelUp}`,
    });
  }

  // Badges: every milestone reached, stored once with the day it was reached.
  const reached = milestones(workouts, weekOf).filter((m) => m.reachedOn);
  if (reached.length) {
    const added = await db
      .insert(userBadges)
      .values(reached.map((m) => ({ userId, badge: m.key, earnedOn: m.reachedOn! })))
      .onConflictDoNothing()
      .returning({ badge: userBadges.badge, earnedOn: userBadges.earnedOn });
    const recent = Date.now() - NOTIFY_WITHIN_DAYS * 86400_000;
    for (const b of added) {
      if (Date.parse(`${b.earnedOn}T00:00:00Z`) < recent) continue;
      const title = reached.find((m) => m.key === b.badge)?.title ?? b.badge;
      await notify(db, userId, { kind: "badge", data: { title }, dedupeKey: `badge:${b.badge}` });
    }
  }

  await completeChallenges(db, userId);
  return { xp, level };
}

/** Marks challenges whose target the person has reached, and tells them once. */
async function completeChallenges(db: Database, userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const open = await db
    .select({ id: challenges.id, title: challenges.title, target: challenges.target })
    .from(challengeMembers)
    .innerJoin(challenges, eq(challenges.id, challengeMembers.challengeId))
    .where(
      and(
        eq(challengeMembers.userId, userId),
        isNull(challengeMembers.completedAt),
        isNotNull(challenges.target),
        gte(challenges.endsOn, weekAgo),
      ),
    );
  for (const c of open) {
    const [mine] = await db.execute<{ score: string }>(
      sql`select score from public.challenge_scores(${c.id}) where user_id = ${userId}`,
    );
    if (!mine || Number(mine.score) < c.target!) continue;
    const [done] = await db
      .update(challengeMembers)
      .set({ completedAt: new Date() })
      .where(
        and(
          eq(challengeMembers.challengeId, c.id),
          eq(challengeMembers.userId, userId),
          isNull(challengeMembers.completedAt),
        ),
      )
      .returning({ at: challengeMembers.completedAt });
    if (done) {
      await notify(db, userId, {
        kind: "challenge_completed",
        challengeId: c.id,
        data: { title: c.title },
        dedupeKey: `challenge:${c.id}`,
      });
    }
  }
}

/** Runs syncAwards without ever failing the caller. */
export async function syncAwardsQuietly(db: Database, userId: string) {
  try {
    await syncAwards(db, userId);
  } catch (err) {
    log.warn("awards_sync_failed", { err });
  }
}

export type MyProgress = {
  xp: number;
  level: number;
  intoLevel: number;
  forNext: number;
  badges: { badge: string; earnedOn: string }[];
  streakWeeks: number;
};

/** The person's level, badges and current weekly streak. */
export async function myProgress(db: Database, me: string): Promise<MyProgress> {
  const workouts = await countedWorkouts(db, me);
  const xp = workouts.reduce((n, w) => n + w.xp, 0);
  const lv = levelFor(xp);
  const [badges, [streak]] = await Promise.all([
    withUser(db, me, (tx) =>
      tx
        .select({ badge: userBadges.badge, earnedOn: userBadges.earnedOn })
        .from(userBadges)
        .where(eq(userBadges.userId, me)),
    ),
    db.execute<{ weeks: number }>(
      sql`select weeks from public.fitness_streaks(array[${me}]::uuid[])`,
    ),
  ]);
  return {
    xp,
    level: lv.level,
    intoLevel: lv.intoLevel,
    forNext: lv.forNext,
    badges,
    streakWeeks: streak?.weeks ?? 0,
  };
}
