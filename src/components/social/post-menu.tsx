"use client";

import { Flag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePostAction } from "@/app/(app)/social/actions";
import { useConfirm } from "@/components/ui/confirm";
import { ReportDialog } from "./report-dialog";

/** Delete your own post, or report someone else's. */
export function PostMenu({
  postId,
  authorId,
  mine,
}: {
  postId: string;
  authorId: string;
  mine: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [reporting, setReporting] = useState(false);
  const [, start] = useTransition();

  if (mine) {
    const remove = async () => {
      const ok = await ask({
        title: "Delete this post?",
        body: "The workout stays in your history; only the post, its likes and comments go.",
        confirm: "Delete post",
        danger: true,
      });
      if (!ok) return;
      start(async () => {
        await deletePostAction(postId);
        router.refresh();
      });
    };
    return (
      <button
        type="button"
        onClick={remove}
        aria-label="Delete post"
        className="text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full"
      >
        <Trash2 className="size-4" />
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setReporting(true)}
        aria-label="Report post"
        className="text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full"
      >
        <Flag className="size-4" />
      </button>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ userId: authorId, postId }}
        what="this post"
      />
    </>
  );
}
