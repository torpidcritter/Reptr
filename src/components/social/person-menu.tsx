"use client";

import { Ban, Flag, MoreHorizontal, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockAction, removeFollowerAction } from "@/app/(app)/social/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { ReportDialog } from "./report-dialog";

/** Block, report, or remove someone from your followers. */
export function PersonMenu({
  userId,
  handle,
  followsYou,
}: {
  userId: string;
  handle: string;
  followsYou: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doBlock = async () => {
    const ok = await ask({
      title: `Block @${handle}?`,
      body: "Neither of you will see the other's profile, workouts or comments, and any follows between you end. They aren't told.",
      confirm: "Block",
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await blockAction(userId);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.push("/social");
    });
  };

  const doRemove = () =>
    start(async () => {
      const res = await removeFollowerAction(userId);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="More options">
        <MoreHorizontal />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`@${handle}`}>
        <div className="flex flex-col gap-2">
          {followsYou && (
            <Button variant="outline" onClick={doRemove} disabled={pending}>
              <UserMinus /> Remove from your followers
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setReporting(true);
            }}
          >
            <Flag /> Report
          </Button>
          <Button
            variant="outline"
            className="border-danger text-danger"
            onClick={doBlock}
            disabled={pending}
          >
            <Ban /> Block
          </Button>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
        </div>
      </Dialog>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ userId }}
        what={`@${handle}`}
      />
    </>
  );
}
