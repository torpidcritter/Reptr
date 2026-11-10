import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import { createdAt, id, isOwner, ownerPolicy } from "./helpers";
import { profiles } from "./profiles";
import { comments, posts, reports, socialProfiles } from "./social";

// Groups, challenges, XP and badges, notifications and moderation. Scores are never
// stored from a device: they're computed in the database from saved workouts by the
// functions in migration 0030 (see docs/social/LEADERBOARDS.md). Tables that hold awards
// (badges, levels), notifications and moderation have no insert policy for signed-in
// users, so only the server can write them.

const uid = sql`(select auth.uid())`;

export const groupVisibility = pgEnum("group_visibility", ["public", "private"]);
export const groupRole = pgEnum("group_role", ["owner", "admin", "member"]);
export const challengeVisibility = pgEnum("challenge_visibility", [
  "only_me",
  "followers",
  "group",
  "public",
]);
/** What a challenge counts. The same scoring as the leaderboards. */
export const challengeMetric = pgEnum("challenge_metric", [
  "workouts",
  "volume",
  "sets",
  "minutes",
]);
export const notificationKind = pgEnum("notification_kind", [
  "follow",
  "follow_request",
  "follow_accepted",
  "like",
  "comment",
  "reply",
  "challenge_completed",
  "badge",
  "level_up",
  "group_joined",
]);
export const moderationAction = pgEnum("moderation_action", [
  "dismiss",
  "remove_post",
  "remove_comment",
  "suspend",
  "unsuspend",
  "exclude_leaderboards",
  "include_leaderboards",
]);

/** A training group. Public groups can be joined by anyone; private ones by invite code. */
export const groups = pgTable(
  "groups",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    visibility: groupVisibility("visibility").notNull().default("private"),
    /** Shared to invite people to a private group. Readable only by its members. */
    inviteCode: text("invite_code")
      .notNull()
      .default(sql`substr(md5(gen_random_uuid()::text), 1, 12)`),
    createdAt: createdAt(),
  },
  (t) => [
    unique("groups_invite_code_key").on(t.inviteCode),
    check("groups_name_length", sql`char_length(${t.name}) between 3 and 40`),
    check(
      "groups_description_length",
      sql`${t.description} is null or char_length(${t.description}) <= 280`,
    ),
    index("groups_owner_idx").on(t.ownerId),
    pgPolicy("groups_read", {
      for: "select",
      to: authenticatedRole,
      // The owner check also lets the creator read the row back as it's inserted.
      using: sql`${t.visibility} = 'public' or ${isOwner(t.ownerId)} or public.group_member(${t.id}, ${uid})`,
    }),
    pgPolicy("groups_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: isOwner(t.ownerId),
    }),
    pgPolicy("groups_admin_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`public.group_admin(${t.id}, ${uid})`,
      withCheck: sql`public.group_admin(${t.id}, ${uid})`,
    }),
    pgPolicy("groups_owner_delete", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.ownerId),
    }),
  ],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_members_user_idx").on(t.userId),
    pgPolicy("group_members_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.group_member(${t.groupId}, ${uid})
        or exists (select 1 from public.groups g where g.id = ${t.groupId} and g.visibility = 'public')`,
    }),
    // Joining a public group yourself, as a plain member. Private groups are joined
    // through group_join(code); the owner is added by a trigger when the group is made.
    pgPolicy("group_members_join_public", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.userId)} and ${t.role} = 'member'
        and exists (select 1 from public.groups g where g.id = ${t.groupId} and g.visibility = 'public')`,
    }),
    // Leaving (not the owner), or an admin removing a member.
    pgPolicy("group_members_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`(${isOwner(t.userId)} and ${t.role} <> 'owner')
        or (public.group_admin(${t.groupId}, ${uid}) and ${t.role} <> 'owner')`,
    }),
  ],
);

/**
 * A challenge: reach a target (or simply compete) on one metric between two dates.
 * Individual = only_me; friend = followers; group = a group's members; public = anyone.
 * Seasonal challenges are public ones the server creates, one per season key.
 */
export const challenges = pgTable(
  "challenges",
  {
    id: id(),
    /** Null for seasonal challenges. */
    creatorId: uuid("creator_id").references(() => socialProfiles.userId, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    metric: challengeMetric("metric").notNull(),
    /** Optional goal in the metric's unit (workouts, kg, sets, minutes). */
    target: numeric("target", { precision: 12, scale: 1, mode: "number" }),
    visibility: challengeVisibility("visibility").notNull(),
    startsOn: date("starts_on").notNull(),
    /** Inclusive. Days are UTC so everyone's challenge ends at the same moment. */
    endsOn: date("ends_on").notNull(),
    seasonKey: text("season_key"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("challenges_season_key").on(t.seasonKey),
    check("challenges_title_length", sql`char_length(${t.title}) between 3 and 60`),
    check(
      "challenges_description_length",
      sql`${t.description} is null or char_length(${t.description}) <= 280`,
    ),
    check(
      "challenges_dates",
      sql`${t.endsOn} >= ${t.startsOn} and ${t.endsOn} - ${t.startsOn} <= 92`,
    ),
    check("challenges_target", sql`${t.target} is null or ${t.target} > 0`),
    check("challenges_group", sql`(${t.visibility} = 'group') = (${t.groupId} is not null)`),
    check(
      "challenges_owner",
      sql`${t.creatorId} is not null or (${t.seasonKey} is not null and ${t.visibility} = 'public')`,
    ),
    index("challenges_creator_idx").on(t.creatorId),
    index("challenges_group_idx").on(t.groupId),
    index("challenges_open_idx").on(t.visibility, t.endsOn),
    pgPolicy("challenges_read", {
      for: "select",
      to: authenticatedRole,
      // The creator check also lets the creator read the row back as it's inserted.
      using: sql`${isOwner(t.creatorId)} or public.challenge_can_see(${t.id}, ${uid})`,
    }),
    pgPolicy("challenges_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.creatorId)} and ${t.seasonKey} is null
        and (${t.groupId} is null or public.group_member(${t.groupId}, ${uid}))`,
    }),
    pgPolicy("challenges_creator_delete", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.creatorId),
    }),
  ],
);

export const challengeMembers = pgTable(
  "challenge_members",
  {
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    joinedAt: createdAt(),
    /** Set by the server when the target is reached. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.challengeId, t.userId] }),
    index("challenge_members_user_idx").on(t.userId),
    pgPolicy("challenge_members_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.challenge_can_see(${t.challengeId}, ${uid})
        and not public.social_blocked(${uid}, ${t.userId})`,
    }),
    // Join a challenge you can see that hasn't ended; never pre-completed.
    pgPolicy("challenge_members_join", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isOwner(t.userId)} and ${t.completedAt} is null
        and public.challenge_can_join(${t.challengeId}, ${uid})`,
    }),
    pgPolicy("challenge_members_leave", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);

/** Badges earned. Awarded by the server only, once each. */
export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    badge: text("badge").notNull(),
    /** The day it was reached (from the workout that reached it). */
    earnedOn: date("earned_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badge] }),
    pgPolicy("user_badges_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isOwner(t.userId)} or public.social_can_see(${uid}, ${t.userId})`,
    }),
  ],
);

/** The last XP total and level the server worked out, to notice a level-up once. */
export const userLevels = pgTable(
  "user_levels",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("user_levels_read", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isOwner(t.userId)} or public.social_can_see(${uid}, ${t.userId})`,
    }),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => socialProfiles.userId, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").references(() => challenges.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    /** Small extra details, e.g. a badge key or a level. Never private training data. */
    data: jsonb("data").$type<Record<string, string | number>>(),
    /** One notification per key: liking, unliking and liking again doesn't repeat it. */
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt.desc()),
    index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notifications_dedupe_key").on(t.userId, t.dedupeKey),
    index("notifications_actor_idx").on(t.actorId),
    index("notifications_post_idx").on(t.postId),
    index("notifications_comment_idx").on(t.commentId),
    index("notifications_challenge_idx").on(t.challengeId),
    index("notifications_group_idx").on(t.groupId),
    pgPolicy("notifications_read", {
      for: "select",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
    // Marking as read.
    pgPolicy("notifications_update", {
      for: "update",
      to: authenticatedRole,
      using: isOwner(t.userId),
      withCheck: isOwner(t.userId),
    }),
    pgPolicy("notifications_delete", {
      for: "delete",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);

export const notificationSettings = pgTable(
  "notification_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    /** Kinds the person doesn't want at all. */
    muted: notificationKind("muted")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Send to this person's devices too (needs a push subscription). */
    push: boolean("push").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [ownerPolicy("notification_settings", t.userId)],
);

/** A browser's Web Push subscription. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("push_subscriptions_endpoint_key").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
    check("push_subscriptions_https", sql`${t.endpoint} like 'https://%'`),
    ownerPolicy("push_subscriptions", t.userId),
  ],
);

/**
 * Moderator decisions on social accounts: hidden from everyone (suspended), or left
 * visible but kept off leaderboards and challenges. Written by the server only.
 */
export const socialSanctions = pgTable(
  "social_sanctions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => socialProfiles.userId, { onDelete: "cascade" }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    excludedFromBoardsAt: timestamp("excluded_from_boards_at", { withTimezone: true }),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("social_sanctions_own_read", {
      for: "select",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);

/** Every moderator decision, kept for the record. No access for signed-in users. */
export const moderationLog = pgTable(
  "moderation_log",
  {
    id: id(),
    moderatorId: uuid("moderator_id").notNull(),
    action: moderationAction("action").notNull(),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("moderation_log_report_idx").on(t.reportId),
    index("moderation_log_target_idx").on(t.targetUserId, t.createdAt.desc()),
  ],
).enableRLS();
