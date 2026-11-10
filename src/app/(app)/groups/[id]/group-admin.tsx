"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteGroupAction,
  leaveGroupAction,
  newInviteCodeAction,
  removeMemberAction,
} from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>, then?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) return setError(res.error);
      if (then) then();
      else router.refresh();
    });
  const errorText = error && (
    <p role="alert" className="text-danger text-sm">
      {error}
    </p>
  );
  return { act, pending, errorText, router };
}

export function InviteCode({ id, code }: { id: string; code: string }) {
  const { act, pending, errorText } = useAct();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Invite code: <code className="bg-muted rounded px-1.5 py-0.5 font-mono">{code}</code>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard?.writeText(code).catch(() => {});
            setCopied(true);
          }}
        >
          <Copy /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => act(() => newInviteCodeAction(id))}
        >
          <RefreshCw /> New code
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        A new code stops the old one working. People already in the group stay.
      </p>
      {errorText}
    </div>
  );
}

export function RemoveMember({
  id,
  member,
  handle,
}: {
  id: string;
  member: string;
  handle: string;
}) {
  const { act, pending, errorText } = useAct();
  const confirm = useConfirm();
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Remove @${handle}`}
        disabled={pending}
        onClick={async () => {
          if (await confirm({ title: `Remove @${handle}?`, confirm: "Remove" }))
            act(() => removeMemberAction(id, member));
        }}
      >
        Remove
      </Button>
      {errorText}
    </>
  );
}

export function LeaveOrDelete({ id, owner }: { id: string; owner: boolean }) {
  const { act, pending, errorText, router } = useAct();
  const confirm = useConfirm();
  return (
    <div className="flex flex-col items-start gap-2">
      {owner ? (
        <Button
          variant="outline"
          className="border-danger text-danger"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Delete this group?",
              body: "Its members and group challenges go too. Nobody's workouts are affected.",
              confirm: "Delete",
              danger: true,
            });
            if (ok)
              act(
                () => deleteGroupAction(id),
                () => router.push("/groups"),
              );
          }}
        >
          Delete group
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: "Leave this group?", confirm: "Leave" }))
              act(
                () => leaveGroupAction(id),
                () => router.push("/groups"),
              );
          }}
        >
          Leave group
        </Button>
      )}
      {errorText}
    </div>
  );
}
