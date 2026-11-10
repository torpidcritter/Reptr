"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followAction, unfollowAction } from "@/app/(app)/social/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

export type FollowState = "none" | "requested" | "following";

/** Follow, ask to follow (private accounts), withdraw a request, or unfollow. */
export function FollowButton({
  userId,
  handle,
  initial,
  isPrivate,
}: {
  userId: string;
  handle: string;
  initial: FollowState;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [state, setState] = useState<FollowState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = () =>
    start(async () => {
      setError(null);
      if (state === "none") {
        const res = await followAction(userId);
        if (res.error) return setError(res.error);
        setState(res.state === "following" ? "following" : "requested");
      } else {
        if (state === "following" && isPrivate) {
          const ok = await ask({
            title: `Unfollow @${handle}?`,
            body: "Their account is private, so you'd need to ask again to see their workouts.",
            confirm: "Unfollow",
          });
          if (!ok) return;
        }
        const res = await unfollowAction(userId);
        if (res.error) return setError(res.error);
        setState("none");
      }
      router.refresh();
    });

  const label = {
    none: isPrivate ? "Ask to follow" : "Follow",
    requested: "Requested",
    following: "Following",
  }[state];

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={state === "none" ? "primary" : "outline"}
        onClick={act}
        disabled={pending}
        aria-label={state === "none" ? `${label} @${handle}` : `${label}. Tap to undo`}
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
