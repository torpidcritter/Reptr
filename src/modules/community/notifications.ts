import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { notifications, notificationSettings, notificationKind } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { log } from "@/lib/log";
import { sendPush } from "./push";

// In-app notifications, plus Web Push to the person's devices when they've turned it
// on and the server has push keys. Written by the server only (the table has no insert
// policy), and never carry private training data: just who did what, with a link.

export type NotificationKind = (typeof notificationKind.enumValues)[number];

export type NewNotification = {
  kind: NotificationKind;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  challengeId?: string | null;
  groupId?: string | null;
  data?: Record<string, string | number>;
  /** Same key, same recipient: kept once. */
  dedupeKey?: string;
};

/** What the person sees, and where it leads. Used in the app and in push messages. */
export function describe(n: {
  kind: NotificationKind;
  actorHandle?: string | null;
  postId?: string | null;
  challengeId?: string | null;
  groupId?: string | null;
  data?: Record<string, string | number> | null;
}): { text: string; href: string } {
  const who = n.actorHandle ? `@${n.actorHandle}` : "Someone";
  const d = n.data ?? {};
  switch (n.kind) {
    case "follow":
      return { text: `${who} started following you`, href: `/u/${n.actorHandle ?? ""}` };
    case "follow_request":
      return { text: `${who} asked to follow you`, href: "/social/requests" };
    case "follow_accepted":
      return { text: `${who} accepted your follow request`, href: `/u/${n.actorHandle ?? ""}` };
    case "like":
      return { text: `${who} liked your workout`, href: `/social/post/${n.postId}` };
    case "comment":
      return { text: `${who} commented on your workout`, href: `/social/post/${n.postId}` };
    case "reply":
      return { text: `${who} replied to your comment`, href: `/social/post/${n.postId}` };
    case "challenge_completed":
      return {
        text: `You completed the challenge “${d.title ?? "challenge"}”`,
        href: `/challenges/${n.challengeId}`,
      };
    case "badge":
      return { text: `New badge: ${d.title ?? "a milestone"}`, href: "/achievements" };
    case "level_up":
      return { text: `You reached level ${d.level ?? ""}`, href: "/achievements" };
    case "group_joined":
      return { text: `${who} joined ${d.name ?? "your group"}`, href: `/groups/${n.groupId}` };
  }
}

async function settingsFor(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));
  return row ?? { muted: [] as NotificationKind[], push: false };
}

/**
 * Notifies someone, unless it's about themselves, they've muted the kind, or either has
 * blocked the other. Never throws: a notification failing must not undo what caused it.
 */
export async function notify(db: Database, recipient: string, n: NewNotification) {
  try {
    if (n.actorId && n.actorId === recipient) return;
    if (n.actorId) {
      const [{ blocked }] = await db.execute<{ blocked: boolean }>(
        sql`select public.social_blocked(${recipient}, ${n.actorId}) as blocked`,
      );
      if (blocked) return;
    }
    const settings = await settingsFor(db, recipient);
    if (settings.muted.includes(n.kind)) return;
    const [row] = await db
      .insert(notifications)
      .values({
        userId: recipient,
        kind: n.kind,
        actorId: n.actorId ?? null,
        postId: n.postId ?? null,
        commentId: n.commentId ?? null,
        challengeId: n.challengeId ?? null,
        groupId: n.groupId ?? null,
        data: n.data ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!row || !settings.push) return;
    let actorHandle: string | null = null;
    if (n.actorId) {
      const [a] = await db.execute<{ handle: string }>(
        sql`select handle from public.social_profiles where user_id = ${n.actorId}`,
      );
      actorHandle = a?.handle ?? null;
    }
    await sendPush(db, recipient, describe({ ...n, actorHandle }));
  } catch (err) {
    log.warn("notify_failed", { err, kind: n.kind });
  }
}

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  text: string;
  href: string;
  createdAt: Date;
  read: boolean;
  actor: { handle: string; displayName: string | null; avatarPath: string | null } | null;
};

const PAGE = 30;

/** The person's notifications, newest first. People they've since blocked drop out. */
export async function listNotifications(db: Database, me: string, before?: Date) {
  const rows = await withUser(db, me, (tx) =>
    tx.execute<{
      id: string;
      kind: NotificationKind;
      post_id: string | null;
      challenge_id: string | null;
      group_id: string | null;
      data: Record<string, string | number> | null;
      created_at: string;
      read_at: string | null;
      actor_id: string | null;
      handle: string | null;
      display_name: string | null;
      avatar_path: string | null;
    }>(sql`
      select n.id, n.kind, n.post_id, n.challenge_id, n.group_id, n.data, n.created_at, n.read_at,
             n.actor_id, c.handle, c.display_name, c.avatar_path
      from public.notifications n
      left join public.profile_cards c on c.user_id = n.actor_id
      where n.user_id = ${me}
        and (n.actor_id is null or c.user_id is not null)
        ${before ? sql`and n.created_at < ${before.toISOString()}` : sql``}
      order by n.created_at desc
      limit ${PAGE + 1}`),
  );
  const page = rows.slice(0, PAGE);
  return {
    items: page.map((r): NotificationView => ({
      id: r.id,
      kind: r.kind,
      ...describe({
        kind: r.kind,
        actorHandle: r.handle,
        postId: r.post_id,
        challengeId: r.challenge_id,
        groupId: r.group_id,
        data: r.data,
      }),
      createdAt: new Date(r.created_at),
      read: r.read_at !== null,
      actor: r.handle
        ? { handle: r.handle, displayName: r.display_name, avatarPath: r.avatar_path }
        : null,
    })),
    next: rows.length > PAGE ? new Date(page.at(-1)!.created_at) : null,
  };
}

export async function unreadCount(db: Database, me: string) {
  const [row] = await withUser(db, me, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, me), isNull(notifications.readAt))),
  );
  return row?.n ?? 0;
}

export async function markAllRead(db: Database, me: string) {
  await withUser(db, me, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me), isNull(notifications.readAt))),
  );
}

/** Notifications older than this are deleted when new ones are listed. */
export const NOTIFICATION_RETENTION_DAYS = 90;

export async function pruneNotifications(db: Database, me: string) {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86400_000);
  await withUser(db, me, (tx) =>
    tx
      .delete(notifications)
      .where(and(eq(notifications.userId, me), lt(notifications.createdAt, cutoff))),
  );
}

export const settingsSchema = z.object({
  muted: z.array(z.enum(notificationKind.enumValues)).max(20),
  push: z.boolean(),
});

export async function getNotificationSettings(db: Database, me: string) {
  const [row] = await withUser(db, me, (tx) =>
    tx.select().from(notificationSettings).where(eq(notificationSettings.userId, me)),
  );
  return { muted: row?.muted ?? [], push: row?.push ?? false };
}

export async function saveNotificationSettings(
  db: Database,
  me: string,
  input: z.input<typeof settingsSchema>,
) {
  const s = settingsSchema.parse(input);
  await withUser(db, me, (tx) =>
    tx
      .insert(notificationSettings)
      .values({ userId: me, muted: s.muted, push: s.push })
      .onConflictDoUpdate({
        target: notificationSettings.userId,
        set: { muted: s.muted, push: s.push, updatedAt: new Date() },
      }),
  );
}
