import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import { createdAt, id, isOwner, updatedAt } from "./helpers";
import { profiles } from "./profiles";
import { workouts } from "./training";

// Social features are opt-in: nobody is visible to anyone until they create a social
// profile with a handle. Who can see what is decided in the database, by the policies
// below and the functions in migration 0026, so a query that forgets a check still can't
// return someone else's private data. Social reads run through withUser() (RLS applies).

export const accountVisibility = pgEnum("account_visibility", ["public", "private"]);
/** Per post. A private account's posts are only ever for its followers. */
export const postVisibility = pgEnum("post_visibility", ["public", "followers", "only_me"]);
export const postKind = pgEnum("post_kind", ["workout"]);
export const reportReason = pgEnum("report_reason", [
  "spam",
  "harassment",
  "hate",
  "sexual_content",
  "self_harm",
  "impersonation",
  "cheating",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "actioned", "dismissed"]);

const uid = sql`(select auth.uid())`;
const blocked = (other: AnyPgColumn) => sql`public.social_blocked(${uid}, ${other})`;

/**
 * A person's public identity. The name shown comes from `profiles.display_name`, read
 * through the `profile_cards` view, which exposes only safe columns.
 */
export const socialProfiles = pgTable(
  "social_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    /** Lowercase letters, digits and underscores; unique. */
    handle: text("handle").notNull(),
    bio: text("bio"),
    /** Path in the private `avatars` bucket: "<user id>/<file>". */
    avatarPath: text("avatar_path"),
    visibility: accountVisibility("visibility").notNull().default("private"),
    /** Shown in search and suggestions. Off: reachable only by exact handle. */
    discoverable: boolean("discoverable").notNull().default(true),
    /** Appear on leaderboards (to people who can see this profile). Off unless chosen. */
    leaderboards: boolean("leaderboards").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("social_profiles_handle_key").on(t.handle),
    check("social_profiles_handle_format", sql`${t.handle} ~ '^[a-z0-9_]{3,20}$'`),
    check("social_profiles_bio_length", sql`${t.bio} is null or char_length(${t.bio}) <= 160`),
    check(
      "social_profiles_avatar_path",
      sql`${t.avatarPath} is null or ${t.avatarPath} like ${t.userId}::text || '/%'`,
    ),
    index("social_profiles_handle_prefix_idx").using("btree", sql`${t.handle} text_pattern_ops`),
    // Anyone signed in can see a profile card unless either has blocked the other.
    pgPolicy("social_profiles_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isOwner(t.userId)} or (not ${blocked(t.userId)} and not public.social_suspended(${t.userId}))`,
    }),
    pgPolicy("social_profiles_owner_write", {
      for: "all",
      to: authenticatedRole,
      using: isOwner(t.userId),
      withCheck: isOwner(t.userId),
    }),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("follows_not_self", sql`${t.followerId} <> ${t.followeeId}`),
    index("follows_followee_idx").on(t.followeeId, t.createdAt.desc()),
    // Either side, or anyone who can see the followed account's followers.
    pgPolicy("follows_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isOwner(t.followerId)} or ${isOwner(t.followeeId)}
        or (public.social_can_see(${uid}, ${t.followeeId}) and not ${blocked(t.followerId)})`,
    }),
    // Following a public account directly, or accepting a request to follow you.
    pgPolicy("follows_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`(
          ${isOwner(t.followerId)} and not ${blocked(t.followeeId)}
          and exists (select 1 from public.social_profiles sp
                      where sp.user_id = ${t.followeeId} and sp.visibility = 'public')
        ) or (
          ${isOwner(t.followeeId)} and not ${blocked(t.followerId)}
          and exists (select 1 from public.follow_requests r
                      where r.requester_id = ${t.followerId} and r.target_id = ${t.followeeId})
        )`,
    }),
    // Unfollow, or remove a follower.
    pgPolicy("follows_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${isOwner(t.followerId)} or ${isOwner(t.followeeId)}`,
    }),
  ],
);

/** Asking to follow a private account. Accepting turns it into a follow. */
export const followRequests = pgTable(
  "follow_requests",
  {
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.targetId] }),
    check("follow_requests_not_self", sql`${t.requesterId} <> ${t.targetId}`),
    index("follow_requests_target_idx").on(t.targetId, t.createdAt.desc()),
    pgPolicy("follow_requests_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isOwner(t.requesterId)} or ${isOwner(t.targetId)}`,
    }),
    pgPolicy("follow_requests_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.requesterId)} and not ${blocked(t.targetId)}
        and not public.social_follows(${t.requesterId}, ${t.targetId})
        and exists (select 1 from public.social_profiles sp
                    where sp.user_id = ${t.targetId} and sp.visibility = 'private')`,
    }),
    pgPolicy("follow_requests_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${isOwner(t.requesterId)} or ${isOwner(t.targetId)}`,
    }),
  ],
);

/** Blocking hides both people from each other everywhere and ends any follows. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    index("blocks_blocked_idx").on(t.blockedId),
    pgPolicy("blocks_owner", {
      for: "all",
      to: authenticatedRole,
      using: isOwner(t.blockerId),
      withCheck: isOwner(t.blockerId),
    }),
  ],
);

/**
 * A shared workout. The summary is built on the server from the saved workout (never
 * sent by the device), and rebuilt when the workout is corrected.
 */
export const posts = pgTable(
  "posts",
  {
    id: id(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    kind: postKind("kind").notNull().default("workout"),
    workoutId: uuid("workout_id").notNull(),
    caption: text("caption"),
    visibility: postVisibility("visibility").notNull().default("followers"),
    summary: jsonb("summary").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "posts_workout_fk",
      columns: [t.workoutId, t.authorId],
      foreignColumns: [workouts.id, workouts.userId],
    }).onDelete("cascade"),
    unique("posts_workout_key").on(t.workoutId),
    check("posts_caption_length", sql`${t.caption} is null or char_length(${t.caption}) <= 500`),
    index("posts_author_idx").on(t.authorId, t.createdAt.desc(), t.id.desc()),
    index("posts_created_idx").on(t.createdAt.desc(), t.id.desc()),
    pgPolicy("posts_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.social_can_see_post(${uid}, ${t.authorId}, ${t.visibility}::text)`,
    }),
    pgPolicy("posts_owner_write", {
      for: "all",
      to: authenticatedRole,
      using: isOwner(t.authorId),
      withCheck: isOwner(t.authorId),
    }),
  ],
);

// Likes and comments are only visible, and only possible, on posts the person can see.
// The posts subquery runs under the posts policy, so it does that check.
const visiblePost = (postId: AnyPgColumn) =>
  sql`exists (select 1 from public.posts p where p.id = ${postId})`;

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index("post_likes_user_idx").on(t.userId),
    pgPolicy("post_likes_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${visiblePost(t.postId)} and (${isOwner(t.userId)} or not ${blocked(t.userId)})`,
    }),
    pgPolicy("post_likes_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.userId)} and ${visiblePost(t.postId)}`,
    }),
    pgPolicy("post_likes_delete", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    /** A reply to a top-level comment. Replies are one level deep. */
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [
    check("comments_body_length", sql`char_length(${t.body}) between 1 and 1000`),
    index("comments_post_idx").on(t.postId, t.createdAt),
    index("comments_author_idx").on(t.authorId),
    index("comments_parent_idx").on(t.parentId),
    pgPolicy("comments_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${visiblePost(t.postId)} and (${isOwner(t.authorId)} or not ${blocked(t.authorId)})`,
    }),
    pgPolicy("comments_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.authorId)} and ${visiblePost(t.postId)}
        and not exists (select 1 from public.posts p
                        where p.id = ${t.postId} and public.social_blocked(${uid}, p.author_id))`,
    }),
    pgPolicy("comments_update", {
      for: "update",
      to: authenticatedRole,
      using: isOwner(t.authorId),
      withCheck: isOwner(t.authorId),
    }),
    // Your own comments, or any comment on your post.
    pgPolicy("comments_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${isOwner(t.authorId)}
        or exists (select 1 from public.posts p where p.id = ${t.postId} and p.author_id = ${uid})`,
    }),
  ],
);

/** Someone flags a person, post or comment. Reviewed with the moderation tools. */
export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    reason: reportReason("reason").notNull(),
    details: text("details"),
    /** What was reported, copied when reported, so it can be reviewed if it's deleted. */
    snapshot: jsonb("snapshot"),
    status: reportStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: createdAt(),
  },
  (t) => [
    check("reports_details_length", sql`${t.details} is null or char_length(${t.details}) <= 1000`),
    check("reports_not_self", sql`${t.reporterId} <> ${t.targetUserId}`),
    index("reports_status_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetUserId),
    index("reports_reporter_idx").on(t.reporterId),
    index("reports_post_idx").on(t.postId),
    index("reports_comment_idx").on(t.commentId),
    pgPolicy("reports_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isOwner(t.reporterId),
    }),
    pgPolicy("reports_read_own", {
      for: "select",
      to: authenticatedRole,
      using: isOwner(t.reporterId),
    }),
  ],
);
