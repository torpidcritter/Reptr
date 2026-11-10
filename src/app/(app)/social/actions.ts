"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { removeFiles } from "@/lib/supabase/storage";
import { audit } from "@/modules/ops/audit";
import { avatarBucket } from "@/modules/social/avatars";
import * as social from "@/modules/social/social";

// Every action checks the session, counts against a rate limit, and lets the database's
// visibility rules have the last word (see src/modules/social/social.ts).

export type ActionResult = { error?: string; ok?: boolean };

const uuid = z.uuid();

/** Runs an action, turning expected refusals into a message for the person. */
async function run(fn: () => Promise<void>, event: string): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof social.SocialError) return { error: e.message };
    if (e instanceof z.ZodError)
      return { error: e.issues[0]?.message ?? "Check what you entered." };
    log.error(event, { err: e });
    return { error: "That didn't work. Try again." };
  }
}

const refresh = (...paths: string[]) => {
  for (const p of ["/social", ...paths]) revalidatePath(p);
};

export type ProfileFormState = ActionResult & { values?: social.ProfileInput };

export async function saveProfileAction(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const values = {
    handle: String(form.get("handle") ?? ""),
    bio: String(form.get("bio") ?? ""),
    visibility: form.get("visibility") === "public" ? ("public" as const) : ("private" as const),
    discoverable: form.get("discoverable") === "on",
    leaderboards: form.get("leaderboards") === "on",
  };
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy, values };
  const res = await run(async () => {
    const { created } = await social.saveProfile(db, user.id, values);
    await audit(db, user.id, created ? "social_profile_created" : "social_profile_updated");
  }, "social_profile_failed");
  refresh("/social/profile");
  return { ...res, values };
}

export async function setAvatarAction(path: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "photo");
  if (busy) return { error: busy };
  const before = await social.myProfile(db, user.id);
  const res = await run(() => social.setAvatar(db, user.id, path), "avatar_failed");
  if (res.ok && before?.avatarPath && before.avatarPath !== path) {
    await removeFiles(avatarBucket, [before.avatarPath]).catch((err) =>
      log.warn("avatar_cleanup_failed", { err }),
    );
  }
  refresh("/social/profile");
  return res;
}

export async function leaveSocialAction(): Promise<ActionResult> {
  const user = await requireUser();
  const before = await social.myProfile(db, user.id);
  const res = await run(() => social.leaveSocial(db, user.id), "leave_social_failed");
  if (res.ok) {
    await audit(db, user.id, "social_profile_deleted");
    if (before?.avatarPath) await removeFiles(avatarBucket, [before.avatarPath]).catch(() => {});
  }
  refresh("/social/profile");
  return res;
}

export async function followAction(target: string): Promise<ActionResult & { state?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(target).success) return { error: "That account isn't available." };
  const busy = await overLimit(user.id, "follow");
  if (busy) return { error: busy };
  let state: string | undefined;
  const res = await run(async () => {
    state = await social.follow(db, user.id, target);
  }, "follow_failed");
  refresh();
  return { ...res, state };
}

export async function unfollowAction(target: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(target).success) return { error: "That account isn't available." };
  const res = await run(() => social.unfollow(db, user.id, target), "unfollow_failed");
  refresh();
  return res;
}

export async function removeFollowerAction(follower: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(follower).success) return { error: "That account isn't available." };
  const res = await run(
    () => social.removeFollower(db, user.id, follower),
    "remove_follower_failed",
  );
  refresh();
  return res;
}

export async function answerRequestAction(
  requester: string,
  accept: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(requester).success) return { error: "That request isn't available." };
  const res = await run(
    () =>
      accept
        ? social.acceptRequest(db, user.id, requester)
        : social.declineRequest(db, user.id, requester),
    "follow_request_failed",
  );
  refresh("/social/requests");
  return res;
}

export async function blockAction(target: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(target).success) return { error: "That account isn't available." };
  const busy = await overLimit(user.id, "follow");
  if (busy) return { error: busy };
  const res = await run(() => social.block(db, user.id, target), "block_failed");
  if (res.ok) await audit(db, user.id, "user_blocked");
  refresh("/social/profile");
  return res;
}

export async function unblockAction(target: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(target).success) return { error: "That account isn't available." };
  const res = await run(() => social.unblock(db, user.id, target), "unblock_failed");
  refresh("/social/profile");
  return res;
}

export async function shareWorkoutAction(input: social.ShareInput): Promise<ActionResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "post");
  if (busy) return { error: busy };
  const res = await run(async () => {
    await social.shareWorkout(db, user.id, input);
    await audit(db, user.id, "workout_shared");
  }, "share_failed");
  const id = uuid.safeParse(input.workoutId);
  refresh(id.success ? `/history/${id.data}` : "/history");
  return res;
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(postId).success) return { error: "That post isn't available." };
  const res = await run(() => social.deletePost(db, user.id, postId), "delete_post_failed");
  refresh("/history");
  return res;
}

export async function likeAction(postId: string, liked: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(postId).success) return { error: "That post isn't available." };
  const busy = await overLimit(user.id, "like");
  if (busy) return { error: busy };
  return run(
    () => (liked ? social.like(db, user.id, postId) : social.unlike(db, user.id, postId)),
    "like_failed",
  );
}

export async function commentAction(input: {
  postId: string;
  parentId?: string | null;
  body: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "comment");
  if (busy) return { error: busy };
  const res = await run(async () => {
    await social.addComment(db, user.id, input);
  }, "comment_failed");
  if (uuid.safeParse(input.postId).success) refresh(`/social/post/${input.postId}`);
  return res;
}

export async function deleteCommentAction(
  commentId: string,
  postId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(commentId).success) return { error: "That comment isn't available." };
  const res = await run(
    () => social.deleteComment(db, user.id, commentId),
    "delete_comment_failed",
  );
  if (uuid.safeParse(postId).success) refresh(`/social/post/${postId}`);
  return res;
}

export async function reportAction(
  input: z.input<typeof social.reportSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "report");
  if (busy) return { error: busy };
  return run(async () => {
    await social.report(db, user.id, input);
    await audit(db, user.id, "report_made");
    log.info("report_made", { reason: input.reason });
  }, "report_failed");
}
