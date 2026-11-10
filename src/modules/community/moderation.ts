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

export const decisionSchema = z.object({
  reportId: z.uuid(),
  action: z.enum([
    "dismiss",
    "remove_post",
    "remove_comment",
    "suspend",
    "unsuspend",
    "exclude_leaderboards",
    "include_leaderboards",
  ]),
  note: z.string().trim().max(500).default(""),
});

/** Applies a decision on a report, records it, and closes the report. */
export async function decide(
  db: Database,
  moderator: string,
  input: z.input<typeof decisionSchema>,
) {
  if (!isModerator(moderator)) throw new NotModeratorError();
  const d = decisionSchema.parse(input);
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(reports).where(eq(reports.id, d.reportId)).for("update");
    if (!r) throw new Error("Report not found");
    const target = r.targetUserId;
    const sanction = (set: Partial<typeof socialSanctions.$inferInsert>) =>
      tx
        .insert(socialSanctions)
        .values({ userId: target, reason: d.note || r.reason, ...set })
        .onConflictDoUpdate({
          target: socialSanctions.userId,
          set: { ...set, reason: d.note || r.reason, updatedAt: new Date() },
        });
    switch (d.action) {
      case "remove_post":
        if (r.postId) await tx.delete(posts).where(eq(posts.id, r.postId));
        break;
      case "remove_comment":
        if (r.commentId) await tx.delete(comments).where(eq(comments.id, r.commentId));
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
      reportId: r.id,
      targetUserId: target,
      note: d.note || null,
    });
    await tx
      .update(reports)
      .set({
        status: d.action === "dismiss" ? "dismissed" : "actioned",
        resolvedAt: new Date(),
        resolution: d.action,
      })
      .where(and(eq(reports.id, r.id), eq(reports.status, "open")));
  });
}

export async function recentDecisions(db: Database, moderator: string) {
  if (!isModerator(moderator)) throw new NotModeratorError();
  return db.select().from(moderationLog).orderBy(desc(moderationLog.createdAt)).limit(50);
}
