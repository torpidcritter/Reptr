"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateAction } from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";

type Action =
  | "dismiss"
  | "remove_post"
  | "remove_comment"
  | "suspend"
  | "unsuspend"
  | "exclude_leaderboards"
  | "include_leaderboards";

export function Decide({
  reportId,
  hasPost,
  hasComment,
  suspended,
  excluded,
}: {
  reportId: string;
  hasPost: boolean;
  hasComment: boolean;
  suspended: boolean;
  excluded: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choices: [Action, string, boolean][] = [
    ["dismiss", "Dismiss", true],
    ["remove_post", "Remove post", hasPost],
    ["remove_comment", "Remove comment", hasComment],
    [
      excluded ? "include_leaderboards" : "exclude_leaderboards",
      excluded ? "Put back on boards" : "Keep off boards",
      true,
    ],
    [suspended ? "unsuspend" : "suspend", suspended ? "Lift suspension" : "Suspend", true],
  ];

  // Ask first, outside the transition: a dialog opened inside one wouldn't show until
  // the transition ends, which is waiting for the dialog.
  const go = async (action: Action, label: string) => {
    if (action !== "dismiss" && !(await confirm({ title: `${label}?`, confirm: label }))) return;
    start(async () => {
      setError(null);
      const res = await moderateAction({ reportId, action, note });
      if (res.error) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`note-${reportId}`} className="sr-only">
        Note
      </label>
      <Input
        id={`note-${reportId}`}
        placeholder="Note for the record (optional)"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {choices
          .filter(([, , show]) => show)
          .map(([action, label]) => (
            <Button
              key={action}
              size="sm"
              variant={action === "dismiss" ? "outline" : "primary"}
              disabled={pending}
              onClick={() => go(action, label)}
            >
              {label}
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
