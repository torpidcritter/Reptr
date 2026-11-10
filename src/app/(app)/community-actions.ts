"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import * as challenges from "@/modules/community/challenges";
import * as groups from "@/modules/community/groups";
import * as moderation from "@/modules/community/moderation";
import * as notifications from "@/modules/community/notifications";
import * as push from "@/modules/community/push";
import { audit } from "@/modules/ops/audit";
import { SocialError } from "@/modules/social/social";

// Groups, challenges, notifications and moderation. Each action checks the session and
// a rate limit; the database's policies have the last word on what's allowed.

export type ActionResult = { error?: string; ok?: boolean; id?: string };

const uuid = z.uuid();

async function run(fn: () => Promise<string | void>, event: string): Promise<ActionResult> {
  try {
    const id = await fn();
    return { ok: true, ...(id ? { id } : {}) };
  } catch (e) {
    if (e instanceof SocialError) return { error: e.message };
    if (e instanceof moderation.NotModeratorError) return { error: e.message };
    if (e instanceof z.ZodError)
      return { error: e.issues[0]?.message ?? "Check what you entered." };
    log.error(event, { err: e });
    return { error: "That didn't work. Try again." };
  }
}

async function guarded(limit: "community" | "moderate") {
  const user = await requireUser();
  return { user, busy: await overLimit(user.id, limit) };
}

// Groups ---------------------------------------------------------------------------

export async function createGroupAction(input: groups.GroupInput): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  const res = await run(() => groups.createGroup(db, user.id, input), "group_create_failed");
  if (res.ok) await audit(db, user.id, "group_created");
  revalidatePath("/groups");
  return res;
}

export async function updateGroupAction(id: string, input: groups.GroupInput) {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That group isn't available." };
  const res = await run(() => groups.updateGroup(db, user.id, id, input), "group_update_failed");
  revalidatePath(`/groups/${id}`);
  return res;
}

export async function deleteGroupAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That group isn't available." };
  const res = await run(() => groups.deleteGroup(db, user.id, id), "group_delete_failed");
  if (res.ok) await audit(db, user.id, "group_deleted");
  revalidatePath("/groups");
  return res;
}

export async function newInviteCodeAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That group isn't available." };
  const res = await run(async () => {
    await groups.newInviteCode(db, user.id, id);
  }, "group_code_failed");
  revalidatePath(`/groups/${id}`);
  return res;
}

export async function joinGroupAction(id: string): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  if (!uuid.safeParse(id).success) return { error: "That group isn't available." };
  const res = await run(() => groups.joinGroup(db, user.id, id), "group_join_failed");
  revalidatePath("/groups");
  revalidatePath(`/groups/${id}`);
  return res;
}

export async function joinByCodeAction(code: string): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  const res = await run(() => groups.joinByCode(db, user.id, String(code)), "group_join_failed");
  revalidatePath("/groups");
  return res;
}

export async function leaveGroupAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That group isn't available." };
  const res = await run(() => groups.leaveGroup(db, user.id, id), "group_leave_failed");
  revalidatePath("/groups");
  return res;
}

export async function removeMemberAction(id: string, member: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success || !uuid.safeParse(member).success)
    return { error: "That member isn't available." };
  const res = await run(() => groups.removeMember(db, user.id, id, member), "group_remove_failed");
  revalidatePath(`/groups/${id}`);
  return res;
}

// Challenges -----------------------------------------------------------------------

export async function createChallengeAction(
  input: challenges.ChallengeInput,
): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  const res = await run(
    () => challenges.createChallenge(db, user.id, input),
    "challenge_create_failed",
  );
  if (res.ok) await audit(db, user.id, "challenge_created");
  revalidatePath("/challenges");
  return res;
}

export async function joinChallengeAction(id: string): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  if (!uuid.safeParse(id).success) return { error: "That challenge isn't available." };
  const res = await run(() => challenges.joinChallenge(db, user.id, id), "challenge_join_failed");
  revalidatePath("/challenges");
  revalidatePath(`/challenges/${id}`);
  return res;
}

export async function leaveChallengeAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That challenge isn't available." };
  const res = await run(() => challenges.leaveChallenge(db, user.id, id), "challenge_leave_failed");
  revalidatePath("/challenges");
  revalidatePath(`/challenges/${id}`);
  return res;
}

export async function deleteChallengeAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "That challenge isn't available." };
  const res = await run(
    () => challenges.deleteChallenge(db, user.id, id),
    "challenge_delete_failed",
  );
  revalidatePath("/challenges");
  return res;
}

// Notifications --------------------------------------------------------------------

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const user = await requireUser();
  const res = await run(() => notifications.markAllRead(db, user.id), "notifications_read_failed");
  revalidatePath("/", "layout");
  return res;
}

export async function saveNotificationSettingsAction(
  input: z.input<typeof notifications.settingsSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const res = await run(
    () => notifications.saveNotificationSettings(db, user.id, input),
    "notification_settings_failed",
  );
  revalidatePath("/notifications");
  return res;
}

export async function savePushSubscriptionAction(
  input: z.input<typeof push.subscriptionSchema>,
): Promise<ActionResult> {
  const { user, busy } = await guarded("community");
  if (busy) return { error: busy };
  if (!push.pushConfigured()) return { error: "Push notifications aren't set up on this server." };
  return run(() => push.savePushSubscription(db, user.id, input), "push_subscribe_failed");
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  return run(
    () => push.removePushSubscription(db, user.id, String(endpoint)),
    "push_unsubscribe_failed",
  );
}

// Moderation -----------------------------------------------------------------------

export async function moderateAction(
  input: z.input<typeof moderation.decisionSchema>,
): Promise<ActionResult> {
  const { user, busy } = await guarded("moderate");
  if (busy) return { error: busy };
  const res = await run(() => moderation.decide(db, user.id, input), "moderation_failed");
  if (res.ok) {
    await audit(db, user.id, "moderation_decision");
    log.info("moderation_decision", { action: input.action });
  }
  revalidatePath("/admin/reports");
  return res;
}
