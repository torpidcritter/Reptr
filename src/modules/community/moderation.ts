import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { comments, moderationLog, posts, reports, socialSanctions } from "@/db/schema";
import type { Database } from "@/db/types";

// The report queue. Moderators are listed by user id in REPTR_MODERATOR_IDS (comma
// separated). Their decisions run on the owner connection, after this check, and every
// one is written to moderation_log. Signed-in people can't read or write these tables.

export function moderatorIds() {
  return (process.env.REPTR_MODERATOR_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
}

export const isModerator = (userId: string) => moderatorIds().includes(userId.toLowerCase());

export class NotModeratorError extends Error {
  constructor() {
    super("Only moderators can do that.");
  }
}

export type QueueItem = {
  id: string;
  reason: string;
  details: string | null;
  snapshot: Record<string, unknown> | null;
  createdAt: Date;
  targetUserId: string;
  targetHandle: string | null;
  postId: string | null;
  commentId: string | null;
  reportsAgainstTarget: number;
  sanction: { suspended: boolean; excluded: boolean };
};

export async function openReports(db: Database, moderator: string): Promise<QueueItem[]> {
  if (!isModerator(moderator)) throw new NotModeratorError();
  const rows = await db.execute<{
    id: string;
    reason: string;
    details: string | null;
    snapshot: Record<string, unknown> | null;
    created_at: string;
    target_user_id: string;
    handle: string | null;
    post_id: string | null;
    comment_id: string | null;
    against: number;
    suspended: boolean;
    excluded: boolean;
  }>(sql`
    select r.id, r.reason, r.details, r.snapshot, r.created_at, r.target_user_id, sp.handle,
           r.post_id, r.comment_id,
           (select count(*)::int from public.reports x where x.target_user_id = r.target_user_id) as against,
           coalesce(s.suspended_at is not null, false) as suspended,
           coalesce(s.excluded_from_boards_at is not null, false) as excluded
    from public.reports r
    left join public.social_profiles sp on sp.user_id = r.target_user_id
    left join public.social_sanctions s on s.user_id = r.target_user_id
    where r.status = 'open'
    order by r.created_at
    limit 100`);
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    snapshot: r.snapshot,
    createdAt: new Date(r.created_at),
    targetUserId: r.target_user_id,
    targetHandle: r.handle,
    postId: r.post_id,
    commentId: r.comment_id,
    reportsAgainstTarget: r.against,
    sanction: { suspended: r.suspended, excluded: r.excluded },
  }));
}

const accountActions = [
  "suspend",
  "unsuspend",
  "exclude_leaderboards",
  "include_leaderboards",
] as const;

/**
 * A decision on a report, or (with userId instead) an account action taken from the
 * sanctions list or the unusual activity list, which have no report to close.
 */
export const decisionSchema = z
  .object({
    reportId: z.uuid().optional(),
    userId: z.uuid().optional(),
    action: z.enum(["dismiss", "remove_post", "remove_comment", ...accountActions]),
    note: z.string().trim().max(500).default(""),
  })
  .refine((d) => Boolean(d.reportId) !== Boolean(d.userId), "Choose a report or an account.")
  .refine(
    (d) => d.reportId || (accountActions as readonly string[]).includes(d.action),
    "That needs a report.",
  );

/** Applies a decision, records it, and closes the report when there is one. */
export async function decide(
  db: Database,
  moderator: string,
  input: z.input<typeof decisionSchema>,
) {
  if (!isModerator(moderator)) throw new NotModeratorError();
  const d = decisionSchema.parse(input);
  await db.transaction(async (tx) => {
    const [r] = d.reportId
      ? await tx.select().from(reports).where(eq(reports.id, d.reportId)).for("update")
      : [null];
    if (d.reportId && !r) throw new Error("Report not found");
    const target = r ? r.targetUserId : d.userId!;
    const reason = d.note || r?.reason || "moderator decision";
    const sanction = (set: Partial<typeof socialSanctions.$inferInsert>) =>
      tx
        .insert(socialSanctions)
        .values({ userId: target, reason, ...set })
        .onConflictDoUpdate({
          target: socialSanctions.userId,
          set: { ...set, reason, updatedAt: new Date() },
        });
    switch (d.action) {
      case "remove_post":
        if (r?.postId) await tx.delete(posts).where(eq(posts.id, r.postId));
        break;
      case "remove_comment":
        if (r?.commentId) await tx.delete(comments).where(eq(comments.id, r.commentId));
        break;
      case "suspend":
        await sanction({ suspendedAt: new Date() });
        break;
      case "unsuspend":
        await sanction({ suspendedAt: null });
        break;
      case "exclude_leaderboards":
        await sanction({ excludedFromBoardsAt: new Date() });
        break;
      case "include_leaderboards":
        await sanction({ excludedFromBoardsAt: null });
        break;
    }
    await tx.insert(moderationLog).values({
      moderatorId: moderator,
      action: d.action,
      reportId: r?.id ?? null,
      targetUserId: target,
      note: d.note || null,
    });
    if (r) {
      await tx
        .update(reports)
        .set({
          status: d.action === "dismiss" ? "dismissed" : "actioned",
          resolvedAt: new Date(),
          resolution: d.action,
        })
        .where(and(eq(reports.id, r.id), eq(reports.status, "open")));
    }
  });
}

export type SanctionedAccount = {
  userId: string;
  handle: string | null;
  suspended: boolean;
  excluded: boolean;
  reason: string | null;
  updatedAt: Date;
};

/** Accounts currently suspended or kept off boards, newest decision first. */
export async function sanctionedAccounts(
  db: Database,
  moderator: string,
): Promise<SanctionedAccount[]> {
  if (!isModerator(moderator)) throw new NotModeratorError();
  const rows = await db.execute<{
    user_id: string;
    handle: string | null;
    suspended: boolean;
    excluded: boolean;
    reason: string | null;
    updated_at: string;
  }>(sql`
    select s.user_id, sp.handle, s.suspended_at is not null as suspended,
           s.excluded_from_boards_at is not null as excluded, s.reason, s.updated_at
    from public.social_sanctions s
    left join public.social_profiles sp on sp.user_id = s.user_id
    where s.suspended_at is not null or s.excluded_from_boards_at is not null
    order by s.updated_at desc
    limit 200`);
  return rows.map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    suspended: r.suspended,
    excluded: r.excluded,
    reason: r.reason,
    updatedAt: new Date(r.updated_at),
  }));
}

export type ActivityFlag = {
  userId: string;
  handle: string;
  kind: "many_workouts" | "volume_spike" | "strength_jump";
  value: number;
  excluded: boolean;
};

/**
 * Accounts whose last week or two looks unlike their own history, for a moderator to
 * look at. A flag is a prompt, never a verdict: nothing happens to the account unless a
 * moderator acts. Only counted training (the leaderboard rules) is considered, and only
 * people on leaderboards or in a challenge, since those are the numbers others see.
 *
 * - many_workouts: more than 14 counted workouts in 7 days.
 * - volume_spike: the last 7 days' volume over 3 times their weekly average for the
 *   8 weeks before, and over 10 tonnes.
 * - strength_jump: a best estimated 1RM in the last 14 days over 25% above their best
 *   on that lift before (from at least 20 kg), as a percentage.
 */
export async function activityFlags(db: Database, moderator: string): Promise<ActivityFlag[]> {
  if (!isModerator(moderator)) throw new NotModeratorError();
  const rows = await db.execute<{
    user_id: string;
    handle: string;
    kind: ActivityFlag["kind"];
    value: string;
    excluded: boolean;
  }>(sql`
    with who as (
      select array_agg(sp.user_id) as ids from public.social_profiles sp
      where (sp.leaderboards or exists (select 1 from public.challenge_members m where m.user_id = sp.user_id))
        and exists (select 1 from public.workouts w where w.user_id = sp.user_id
                    and w.status = 'completed' and w.finished_at >= now() - interval '14 days')
    ), fw as (
      select f.* from who, public.fitness_workouts(now() - interval '70 days', now(), who.ids) f
    ), lifts as (
      select f.user_id, we.exercise_id, f.finished_at >= now() - interval '14 days' as recent,
             max(case when ws.reps = 1 then ws.weight_kg else ws.weight_kg * (1 + ws.reps / 30.0) end) as best
      from fw f
      join public.workout_exercises we on we.workout_id = f.workout_id
      join public.workout_sets ws on ws.workout_exercise_id = we.id
      where ws.type <> 'warmup' and ws.completed_at is not null
        and ws.weight_kg > 0 and ws.weight_kg <= 500 and ws.reps between 1 and 12
      group by 1, 2, 3
    ), flags as (
      select user_id, 'many_workouts' as kind, count(*)::numeric as value
      from fw where finished_at >= now() - interval '7 days'
      group by user_id having count(*) > 14
      union all
      select user_id, 'volume_spike', round(cur) from (
        select user_id,
               coalesce(sum(volume) filter (where finished_at >= now() - interval '7 days'), 0) as cur,
               sum(volume) filter (where finished_at < now() - interval '7 days'
                                   and finished_at >= now() - interval '63 days') / 8.0 as base
        from fw group by user_id
      ) v where v.base > 0 and v.cur > 3 * v.base and v.cur > 10000
      union all
      select r.user_id, 'strength_jump', round(max(100 * (r.best / p.best - 1)))
      from lifts r join lifts p on p.user_id = r.user_id and p.exercise_id = r.exercise_id
      where r.recent and not p.recent and p.best >= 20 and r.best > 1.25 * p.best
      group by r.user_id
    )
    select f.user_id, sp.handle, f.kind, f.value,
           coalesce(s.excluded_from_boards_at is not null, false) as excluded
    from flags f
    join public.social_profiles sp on sp.user_id = f.user_id
    left join public.social_sanctions s on s.user_id = f.user_id
    order by f.kind, f.value desc
    limit 100`);
  return rows.map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    kind: r.kind,
    value: Number(r.value),
    excluded: r.excluded,
  }));
}

export async function recentDecisions(db: Database, moderator: string) {
  if (!isModerator(moderator)) throw new NotModeratorError();
  return db.select().from(moderationLog).orderBy(desc(moderationLog.createdAt)).limit(50);
}
