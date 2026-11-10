"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateAction } from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

type AccountAction = "suspend" | "unsuspend" | "exclude_leaderboards" | "include_leaderboards";

/** Account-level decisions that don't close a report: from the flags or sanctions lists. */
export function AccountActions({
  userId,
  handle,
  actions,
}: {
  userId: string;
  handle: string | null;
  actions: readonly (readonly [AccountAction, string])[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Confirm first: a dialog opened inside a transition waits for the transition.
  const go = async (action: AccountAction, label: string) => {
    const who = handle ? `@${handle}` : "this account";
    if (!(await confirm({ title: `${label} for ${who}?`, confirm: label }))) return;
    start(async () => {
      setError(null);
      const res = await moderateAction({ userId, action });
      if (res.error) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(([action, label]) => (
        <Button
          key={action}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => go(action, label)}
        >
          {label}
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
