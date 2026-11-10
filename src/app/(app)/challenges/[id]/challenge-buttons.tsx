"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteChallengeAction,
  joinChallengeAction,
  leaveChallengeAction,
} from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

export function ChallengeButtons({
  id,
  joined,
  canJoin,
  isCreator,
}: {
  id: string;
  joined: boolean;
  canJoin: boolean;
  isCreator: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) return setError(res.error);
      if (after) after();
      else router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {!joined && canJoin && (
          <Button onClick={() => act(() => joinChallengeAction(id))} disabled={pending}>
            Join challenge
          </Button>
        )}
        {joined && !isCreator && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Leave this challenge?",
                body: "Your score stops showing in its standings.",
                confirm: "Leave",
              });
              if (ok) act(() => leaveChallengeAction(id));
            }}
          >
            Leave
          </Button>
        )}
        {isCreator && (
          <Button
            variant="outline"
            className="border-danger text-danger"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this challenge?",
                body: "It goes for everyone in it. Workouts aren't affected.",
                confirm: "Delete",
                danger: true,
              });
              if (ok)
                act(
                  () => deleteChallengeAction(id),
                  () => router.push("/challenges"),
                );
            }}
          >
            Delete
          </Button>
        )}
      </div>
      {!joined && canJoin && (
        <p className="text-muted-foreground text-xs">
          Joining shows your score to everyone who can see this challenge.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
