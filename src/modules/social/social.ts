import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  blocks,
  comments,
  followRequests,
  follows,
  postLikes,
  posts,
  profiles,
  reports,
  socialProfiles,
} from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { recordsForWorkout } from "@/modules/analytics/records";
import { getWorkout } from "@/modules/workouts/workouts";
import { buildSummary, type WorkoutSummary } from "./summary";

// Every read and write here runs as the signed-in person (withUser), so the database's
// visibility rules decide what comes back, on top of the checks below. A message from a
// SocialError is safe to show to the person.

export class SocialError extends Error {}

/** Postgres refused because of a row-level security policy. */
const refused = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "42501" || err.cause?.code === "42501";
};
const duplicate = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

// ---------------------------------------------------------------------------
// Profiles

const RESERVED = new Set([
  "admin",
  "administrator",
  "reptr",
  "support",
  "help",
  "moderator",
  "mod",
  "staff",
  "official",
  "settings",
  "me",
  "you",
  "null",
  "undefined",
]);

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Use 3 to 20 letters, numbers or underscores.")
  .refine((h) => !RESERVED.has(h), "That handle is reserved. Pick another.");

export const profileSchema = z.object({
  handle: handleSchema,
  bio: z.string().trim().max(160, "Keep your bio under 160 characters.").default(""),
  visibility: z.enum(["public", "private"]),
  discoverable: z.boolean().default(true),
});
export type ProfileInput = z.input<typeof profileSchema>;

export type ProfileCard = {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarPath: string | null;
  visibility: "public" | "private";
};

const cardColumns = sql`user_id as "userId", handle, display_name as "displayName", bio,
  avatar_path as "avatarPath", visibility`;

/** The signed-in person's social profile, or null before they've set one up. */
export async function myProfile(db: Database, me: string) {
  const [row] = await db.select().from(socialProfiles).where(eq(socialProfiles.userId, me));
  return row ?? null;
}

/**
 * Creates or updates the person's social profile. Switching to public accepts any
 * pending follow requests, since anyone could now follow directly.
 */
export async function saveProfile(db: Database, me: string, input: ProfileInput) {
  const p = profileSchema.parse(input);
  try {
    return await withUser(db, me, async (tx) => {
      const [before] = await tx
        .select({ visibility: socialProfiles.visibility })
        .from(socialProfiles)
        .where(eq(socialProfiles.userId, me));
      const values = {
        handle: p.handle,
        bio: p.bio || null,
        visibility: p.visibility,
        discoverable: p.discoverable,
      };
      await tx
        .insert(socialProfiles)
        .values({ userId: me, ...values })
        .onConflictDoUpdate({ target: socialProfiles.userId, set: values });
      if (before?.visibility === "private" && p.visibility === "public") {
        await acceptAll(tx, me);
      }
      return { created: !before };
    });
  } catch (e) {
    if (duplicate(e)) throw new SocialError("That handle is taken. Pick another.");
    throw e;
  }
}

async function acceptAll(tx: Database, me: string) {
  const pending = await tx
    .select({ requesterId: followRequests.requesterId })
    .from(followRequests)
    .where(eq(followRequests.targetId, me));
  if (!pending.length) return;
  await tx
    .insert(follows)
    .values(pending.map((r) => ({ followerId: r.requesterId, followeeId: me })))
    .onConflictDoNothing();
  await tx.delete(followRequests).where(eq(followRequests.targetId, me));
}

/** Sets or clears the avatar path (the file is uploaded to the person's own folder). */
export async function setAvatar(db: Database, me: string, path: string | null) {
  if (path && !new RegExp(`^${me}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`).test(path))
    throw new SocialError("That picture couldn't be saved.");
  await withUser(db, me, (tx) =>
    tx.update(socialProfiles).set({ avatarPath: path }).where(eq(socialProfiles.userId, me)),
  );
}

/** Leaves social features: profile, follows, posts, likes and comments are deleted. */
export async function leaveSocial(db: Database, me: string) {
  await withUser(db, me, (tx) => tx.delete(socialProfiles).where(eq(socialProfiles.userId, me)));
}

export type Relationship = {
  self: boolean;
  following: boolean;
  followsYou: boolean;
  requested: boolean;
  /** They asked to follow you. */
  requestedYou: boolean;
  /** Whether you can see their posts, followers and following. */
  canSee: boolean;
};

/** A profile card by handle, with how the viewer relates to them. Null if hidden or absent. */
export async function profileByHandle(db: Database, me: string, handle: string) {
  const h = handleSchema.safeParse(handle);
  if (!h.success && !/^[a-z0-9_]{3,20}$/.test(handle)) return null;
  return withUser(db, me, async (tx) => {
    const [card] = await tx.execute<ProfileCard>(
      sql`select ${cardColumns} from public.profile_cards where handle = ${handle.toLowerCase()}`,
    );
    if (!card) return null;
    const [rel] = await tx.execute<Omit<Relationship, "self" | "canSee"> & { canSee: boolean }>(
      sql`select
        public.social_follows(${me}, ${card.userId}) as following,
        public.social_follows(${card.userId}, ${me}) as "followsYou",
        exists (select 1 from public.follow_requests where requester_id = ${me} and target_id = ${card.userId}) as requested,
        exists (select 1 from public.follow_requests where requester_id = ${card.userId} and target_id = ${me}) as "requestedYou",
        public.social_can_see(${me}, ${card.userId}) as "canSee"`,
    );
    const [counts] = await tx.execute<{ followers: number; following: number }>(
      sql`select followers, following from public.social_counts(${card.userId})`,
    );
    return {
      card,
      relationship: { ...rel, self: card.userId === me } as Relationship,
      counts,
    };
  });
}

/** Whether the viewer follows, or has asked to follow, each of these people. */
export async function followStates(db: Database, me: string, ids: string[]) {
  const out = new Map<string, "following" | "requested" | "none">();
  if (!ids.length) return out;
  const rows = await withUser(db, me, (tx) =>
    tx.execute<{ id: string; following: boolean; requested: boolean }>(sql`
      select c.user_id as id,
        public.social_follows(${me}, c.user_id) as following,
        exists (select 1 from public.follow_requests r
                where r.requester_id = ${me} and r.target_id = c.user_id) as requested
      from public.profile_cards c
      where c.user_id in ${ids}`),
  );
  for (const r of rows)
    out.set(r.id, r.following ? "following" : r.requested ? "requested" : "none");
  return out;
}

/** Discoverable people whose handle or name matches. Blocked people never appear. */
export async function searchPeople(db: Database, me: string, query: string) {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const like = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return withUser(db, me, (tx) =>
    tx.execute<ProfileCard>(sql`
      select ${cardColumns} from public.profile_cards
      where discoverable and user_id <> ${me}
        and (handle like ${like} or lower(display_name) like ${like}
             or lower(display_name) like ${`% ${like}`})
      order by (handle = ${q}) desc, handle
      limit 20`),
  );
}

/**
 * People followed by the people you follow, ranked by how many of them follow each one.
 * Only uses follow lists you're allowed to see; never people you follow, asked to
 * follow, or blocked.
 */
export async function suggestions(db: Database, me: string, limit = 8) {
  return withUser(db, me, (tx) =>
    tx.execute<ProfileCard & { mutual: number }>(sql`
      select ${sql.raw(`c.user_id as "userId", c.handle, c.display_name as "displayName", c.bio,
        c.avatar_path as "avatarPath", c.visibility`)}, count(*)::int as mutual
      from public.follows f1
      join public.follows f2 on f2.follower_id = f1.followee_id
      join public.profile_cards c on c.user_id = f2.followee_id
      where f1.follower_id = ${me}
        and f2.followee_id <> ${me}
        and c.discoverable
        and not public.social_follows(${me}, f2.followee_id)
        and not exists (select 1 from public.follow_requests r
                        where r.requester_id = ${me} and r.target_id = f2.followee_id)
      group by c.user_id, c.handle, c.display_name, c.bio, c.avatar_path, c.visibility
      order by mutual desc, c.handle
      limit ${limit}`),
  );
}

// ---------------------------------------------------------------------------
// Follows

/** Follows a public account, or asks to follow a private one. */
export async function follow(db: Database, me: string, target: string) {
  if (target === me) throw new SocialError("You can't follow yourself.");
  try {
    return await withUser(db, me, async (tx) => {
      const [card] = await tx.execute<{ visibility: string }>(
        sql`select visibility from public.profile_cards where user_id = ${target}`,
      );
      if (!card) throw new SocialError("That account isn't available.");
      if (card.visibility === "public") {
        await tx
          .insert(follows)
          .values({ followerId: me, followeeId: target })
          .onConflictDoNothing();
        return "following" as const;
      }
      await tx
        .insert(followRequests)
        .values({ requesterId: me, targetId: target })
        .onConflictDoNothing();
      return "requested" as const;
    });
  } catch (e) {
    if (refused(e)) throw new SocialError("You can't follow this account.");
    throw e;
  }
}

/** Stops following, or withdraws a request. */
export async function unfollow(db: Database, me: string, target: string) {
  await withUser(db, me, async (tx) => {
    await tx.delete(follows).where(and(eq(follows.followerId, me), eq(follows.followeeId, target)));
    await tx
      .delete(followRequests)
      .where(and(eq(followRequests.requesterId, me), eq(followRequests.targetId, target)));
  });
}

/** Removes someone from your followers. */
export async function removeFollower(db: Database, me: string, follower: string) {
  await withUser(db, me, (tx) =>
    tx.delete(follows).where(and(eq(follows.followerId, follower), eq(follows.followeeId, me))),
  );
}

/** Accepts a follow request. The database only allows it while the request exists. */
export async function acceptRequest(db: Database, me: string, requester: string) {
  try {
    await withUser(db, me, async (tx) => {
      await tx
        .insert(follows)
        .values({ followerId: requester, followeeId: me })
        .onConflictDoNothing();
      await tx
        .delete(followRequests)
        .where(and(eq(followRequests.requesterId, requester), eq(followRequests.targetId, me)));
    });
  } catch (e) {
    if (refused(e)) throw new SocialError("That request was withdrawn.");
    throw e;
  }
}

export async function declineRequest(db: Database, me: string, requester: string) {
  await withUser(db, me, (tx) =>
    tx
      .delete(followRequests)
      .where(and(eq(followRequests.requesterId, requester), eq(followRequests.targetId, me))),
  );
}

/** People asking to follow you, newest first. */
export async function incomingRequests(db: Database, me: string) {
  return withUser(db, me, (tx) =>
    tx.execute<ProfileCard & { requestedAt: string }>(sql`
      select ${sql.raw(`c.user_id as "userId", c.handle, c.display_name as "displayName", c.bio,
        c.avatar_path as "avatarPath", c.visibility`)}, r.created_at as "requestedAt"
      from public.follow_requests r
      join public.profile_cards c on c.user_id = r.requester_id
      where r.target_id = ${me}
      order by r.created_at desc`),
  );
}

/** Followers or following of someone, if the viewer may see them. */
export async function connections(
  db: Database,
  me: string,
  userId: string,
  which: "followers" | "following",
) {
  const [mine, theirs] =
    which === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  return withUser(db, me, (tx) =>
    tx.execute<ProfileCard>(sql`
      select ${sql.raw(`c.user_id as "userId", c.handle, c.display_name as "displayName", c.bio,
        c.avatar_path as "avatarPath", c.visibility`)}
      from public.follows f
      join public.profile_cards c on c.user_id = f.${sql.raw(theirs)}
      where f.${sql.raw(mine)} = ${userId}
      order by f.created_at desc
      limit 200`),
  );
}

// ---------------------------------------------------------------------------
// Blocks

/** Blocks someone: neither sees the other, and follows between them end. */
export async function block(db: Database, me: string, target: string) {
  if (target === me) throw new SocialError("You can't block yourself.");
  await withUser(db, me, (tx) =>
    tx.insert(blocks).values({ blockerId: me, blockedId: target }).onConflictDoNothing(),
  );
}

export async function unblock(db: Database, me: string, target: string) {
  await withUser(db, me, (tx) =>
    tx.delete(blocks).where(and(eq(blocks.blockerId, me), eq(blocks.blockedId, target))),
  );
}

/** People you've blocked, so you can unblock them. Your own data, so read directly. */
export async function blockedPeople(db: Database, me: string) {
  return db
    .select({
      userId: blocks.blockedId,
      handle: socialProfiles.handle,
      displayName: profiles.displayName,
      blockedAt: blocks.createdAt,
    })
    .from(blocks)
    .leftJoin(socialProfiles, eq(socialProfiles.userId, blocks.blockedId))
    .leftJoin(profiles, eq(profiles.userId, blocks.blockedId))
    .where(eq(blocks.blockerId, me))
    .orderBy(desc(blocks.createdAt));
}

// ---------------------------------------------------------------------------
// Posts

export const shareSchema = z.object({
  workoutId: z.uuid(),
  caption: z.string().trim().max(500, "Keep the caption under 500 characters.").default(""),
  visibility: z.enum(["public", "followers", "only_me"]),
});
export type ShareInput = z.input<typeof shareSchema>;

/** The summary of one of the person's finished workouts, from what the server saved. */
export async function workoutSummary(db: Database, me: string, workoutId: string) {
  const w = await getWorkout(db, me, workoutId);
  if (!w || w.status !== "completed") return null;
  return buildSummary(w, await recordsForWorkout(db, me, workoutId));
}

/** Shares a finished workout (or updates how it's shared). Returns the post id. */
export async function shareWorkout(db: Database, me: string, input: ShareInput) {
  const s = shareSchema.parse(input);
  if (!(await myProfile(db, me))) throw new SocialError("Set up your profile before sharing.");
  const summary = await workoutSummary(db, me, s.workoutId);
  if (!summary) throw new SocialError("Only finished workouts can be shared.");
  return withUser(db, me, async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({
        authorId: me,
        workoutId: s.workoutId,
        caption: s.caption || null,
        visibility: s.visibility,
        summary,
      })
      .onConflictDoUpdate({
        target: posts.workoutId,
        set: { caption: s.caption || null, visibility: s.visibility, summary },
      })
      .returning({ id: posts.id });
    return row.id;
  });
}

/** After a workout is corrected, its post shows the corrected numbers. */
export async function refreshPostFor(tx: Database, userId: string, workoutId: string) {
  const [post] = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.workoutId, workoutId), eq(posts.authorId, userId)));
  if (!post) return;
  const summary = await workoutSummary(tx, userId, workoutId);
  if (summary) await tx.update(posts).set({ summary }).where(eq(posts.id, post.id));
}

export async function deletePost(db: Database, me: string, postId: string) {
  await withUser(db, me, (tx) =>
    tx.delete(posts).where(and(eq(posts.id, postId), eq(posts.authorId, me))),
  );
}

export type FeedPost = {
  id: string;
  workoutId: string;
  caption: string | null;
  visibility: "public" | "followers" | "only_me";
  summary: WorkoutSummary;
  createdAt: Date;
  author: ProfileCard;
  likes: number;
  comments: number;
  likedByMe: boolean;
};

export type FeedCursor = { createdAt: string; id: string };

const PAGE = 20;

/**
 * Posts as the viewer is allowed to see them, newest first, with a keyset cursor.
 * `scope` is the people followed (and yourself), or one author.
 */
async function listPosts(
  db: Database,
  me: string,
  scope: { following: true } | { author: string },
  cursor?: FeedCursor,
) {
  return withUser(db, me, async (tx) => {
    const who =
      "author" in scope
        ? eq(posts.authorId, scope.author)
        : or(
            eq(posts.authorId, me),
            inArray(
              posts.authorId,
              tx.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, me)),
            ),
          );
    const after = cursor
      ? or(
          lt(posts.createdAt, new Date(cursor.createdAt)),
          and(eq(posts.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
        )
      : undefined;
    const rows = await tx
      .select()
      .from(posts)
      .where(and(who, after))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(PAGE + 1);
    const page = rows.slice(0, PAGE);
    const out = await decorate(tx, me, page);
    const last = page.at(-1);
    return {
      posts: out,
      next:
        rows.length > PAGE && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
    };
  });
}

async function decorate(
  tx: Database,
  me: string,
  rows: (typeof posts.$inferSelect)[],
): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authors = [...new Set(rows.map((r) => r.authorId))];
  const cards = await tx.execute<ProfileCard>(
    sql`select ${cardColumns} from public.profile_cards where user_id in ${authors}`,
  );
  const likeRows = await tx
    .select({
      postId: postLikes.postId,
      n: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${postLikes.userId} = ${me})`,
    })
    .from(postLikes)
    .where(inArray(postLikes.postId, ids))
    .groupBy(postLikes.postId);
  const commentRows = await tx
    .select({ postId: comments.postId, n: sql<number>`count(*)::int` })
    .from(comments)
    .where(inArray(comments.postId, ids))
    .groupBy(comments.postId);
  const byCard = new Map(cards.map((c) => [c.userId, c]));
  const likes = new Map(likeRows.map((l) => [l.postId, l]));
  const commentCount = new Map(commentRows.map((c) => [c.postId, c.n]));
  return rows
    .filter((r) => byCard.has(r.authorId))
    .map((r) => ({
      id: r.id,
      workoutId: r.workoutId,
      caption: r.caption,
      visibility: r.visibility,
      summary: r.summary as WorkoutSummary,
      createdAt: r.createdAt,
      author: byCard.get(r.authorId)!,
      likes: likes.get(r.id)?.n ?? 0,
      likedByMe: likes.get(r.id)?.mine ?? false,
      comments: commentCount.get(r.id) ?? 0,
    }));
}

/** Your feed: your posts and those of people you follow, as you're allowed to see them. */
export const feed = (db: Database, me: string, cursor?: FeedCursor) =>
  listPosts(db, me, { following: true }, cursor);

/** One person's posts, as the viewer is allowed to see them. */
export const postsBy = (db: Database, me: string, author: string, cursor?: FeedCursor) =>
  listPosts(db, me, { author }, cursor);

/** The viewer's post for a workout, if they've shared it. */
export async function postForWorkout(db: Database, me: string, workoutId: string) {
  const [row] = await db
    .select({ id: posts.id, visibility: posts.visibility, caption: posts.caption })
    .from(posts)
    .where(and(eq(posts.workoutId, workoutId), eq(posts.authorId, me)));
  return row ?? null;
}

export type CommentView = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  author: ProfileCard;
  mine: boolean;
};

/** One post with its comments, or null if the viewer can't see it. */
export async function getPost(db: Database, me: string, postId: string) {
  if (!z.uuid().safeParse(postId).success) return null;
  return withUser(db, me, async (tx) => {
    const [row] = await tx.select().from(posts).where(eq(posts.id, postId));
    if (!row) return null;
    const [post] = await decorate(tx, me, [row]);
    if (!post) return null;
    const list = await tx
      .select()
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt)
      .limit(500);
    const authorIds = [...new Set(list.map((c) => c.authorId))];
    const cards = authorIds.length
      ? await tx.execute<ProfileCard>(
          sql`select ${cardColumns} from public.profile_cards where user_id in ${authorIds}`,
        )
      : [];
    const byCard = new Map(cards.map((c) => [c.userId, c]));
    const views: CommentView[] = list
      .filter((c) => byCard.has(c.authorId))
      .map((c) => ({
        id: c.id,
        parentId: c.parentId,
        body: c.body,
        createdAt: c.createdAt,
        author: byCard.get(c.authorId)!,
        mine: c.authorId === me,
      }));
    return { post, comments: views, isAuthor: row.authorId === me };
  });
}

export async function like(db: Database, me: string, postId: string) {
  try {
    await withUser(db, me, (tx) =>
      tx.insert(postLikes).values({ postId, userId: me }).onConflictDoNothing(),
    );
  } catch (e) {
    if (refused(e)) throw new SocialError("That post isn't available.");
    throw e;
  }
}

export async function unlike(db: Database, me: string, postId: string) {
  await withUser(db, me, (tx) =>
    tx.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, me))),
  );
}

export const commentSchema = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(1000, "Keep comments under 1000 characters."),
});

export async function addComment(db: Database, me: string, input: z.input<typeof commentSchema>) {
  const c = commentSchema.parse(input);
  if (!(await myProfile(db, me))) throw new SocialError("Set up your profile before commenting.");
  try {
    return await withUser(db, me, async (tx) => {
      const [row] = await tx
        .insert(comments)
        .values({ postId: c.postId, parentId: c.parentId, authorId: me, body: c.body })
        .returning({ id: comments.id });
      return row.id;
    });
  } catch (e) {
    if (refused(e)) throw new SocialError("You can't comment on this post.");
    throw e;
  }
}

/** Deletes your comment, or any comment on your post. */
export async function deleteComment(db: Database, me: string, commentId: string) {
  await withUser(db, me, (tx) => tx.delete(comments).where(eq(comments.id, commentId)));
}

// ---------------------------------------------------------------------------
// Reports

export const reportSchema = z.object({
  targetUserId: z.uuid(),
  postId: z.uuid().nullable().default(null),
  commentId: z.uuid().nullable().default(null),
  reason: z.enum([
    "spam",
    "harassment",
    "hate",
    "sexual_content",
    "self_harm",
    "impersonation",
    "cheating",
    "other",
  ]),
  details: z.string().trim().max(1000).default(""),
});

/**
 * Reports a person, post or comment. A copy of what was reported (as the reporter saw
 * it) is kept with the report, so it can be reviewed even if it's deleted.
 */
export async function report(db: Database, me: string, input: z.input<typeof reportSchema>) {
  const r = reportSchema.parse(input);
  if (r.targetUserId === me) throw new SocialError("You can't report yourself.");
  return withUser(db, me, async (tx) => {
    let snapshot: Record<string, unknown> | null = null;
    if (r.commentId) {
      const [c] = await tx
        .select({ body: comments.body, authorId: comments.authorId, postId: comments.postId })
        .from(comments)
        .where(eq(comments.id, r.commentId));
      if (!c || c.authorId !== r.targetUserId)
        throw new SocialError("That comment isn't available.");
      snapshot = { comment: c.body };
    } else if (r.postId) {
      const [p] = await tx
        .select({ caption: posts.caption, summary: posts.summary, authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.id, r.postId));
      if (!p || p.authorId !== r.targetUserId) throw new SocialError("That post isn't available.");
      snapshot = { caption: p.caption, summary: p.summary };
    }
    const [card] = await tx.execute<{ handle: string; bio: string | null }>(
      sql`select handle, bio from public.profile_cards where user_id = ${r.targetUserId}`,
    );
    const [row] = await tx
      .insert(reports)
      .values({
        reporterId: me,
        targetUserId: r.targetUserId,
        postId: r.postId,
        commentId: r.commentId,
        reason: r.reason,
        details: r.details || null,
        snapshot: { ...snapshot, profile: card ?? null },
      })
      .returning({ id: reports.id });
    return row.id;
  });
}
