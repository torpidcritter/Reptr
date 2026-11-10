"use client";

import { Flag, Reply, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/avatar";
import { ReportDialog } from "@/components/social/report-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { commentAction, deleteCommentAction } from "../../actions";

export type CommentItem = {
  id: string;
  parentId: string | null;
  body: string;
  when: string;
  mine: boolean;
  author: { userId: string; handle: string; displayName: string | null; avatarUrl: string | null };
};

/** Comments with one level of replies. Post authors can remove any comment on their post. */
export function Comments({
  postId,
  items,
  isAuthor,
}: {
  postId: string;
  items: CommentItem[];
  isAuthor: boolean;
}) {
  const top = items.filter((c) => !c.parentId);
  const replies = (id: string) => items.filter((c) => c.parentId === id);
  return (
    <div className="flex flex-col gap-4">
      <CommentForm postId={postId} />
      {top.length === 0 && <p className="text-muted-foreground text-sm">No comments yet.</p>}
      <ul className="flex flex-col gap-4">
        {top.map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <One c={c} postId={postId} canDelete={c.mine || isAuthor} canReply />
            <ul className="ml-11 flex flex-col gap-2 border-l pl-3">
              {replies(c.id).map((r) => (
                <li key={r.id}>
                  <One c={r} postId={postId} canDelete={r.mine || isAuthor} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function One({
  c,
  postId,
  canDelete,
  canReply = false,
}: {
  c: CommentItem;
  postId: string;
  canDelete: boolean;
  canReply?: boolean;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-3">
      <Avatar
        name={c.author.displayName}
        handle={c.author.handle}
        url={c.author.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/u/${c.author.handle}`} className="font-medium">
            {c.author.displayName || `@${c.author.handle}`}
          </Link>{" "}
          <span className="text-muted-foreground text-xs">{c.when}</span>
        </p>
        <p className="text-sm break-words whitespace-pre-line">{c.body}</p>
        <div className="flex gap-1">
          {canReply && (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 text-xs"
            >
              <Reply className="size-3.5" /> Reply
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteCommentAction(c.id, postId);
                  router.refresh();
                })
              }
              className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 px-2 text-xs"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
          {!c.mine && (
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 px-2 text-xs"
            >
              <Flag className="size-3.5" /> Report
            </button>
          )}
        </div>
        {replying && (
          <CommentForm postId={postId} parentId={c.id} onDone={() => setReplying(false)} />
        )}
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          target={{ userId: c.author.userId, postId, commentId: c.id }}
          what="this comment"
        />
      </div>
    </div>
  );
}

function CommentForm({
  postId,
  parentId = null,
  onDone,
}: {
  postId: string;
  parentId?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = parentId ? `reply-${parentId}` : "comment";
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await commentAction({ postId, parentId, body });
          if (res.error) return setError(res.error);
          setBody("");
          onDone?.();
          router.refresh();
        });
      }}
    >
      <label htmlFor={id} className="sr-only">
        {parentId ? "Reply" : "Add a comment"}
      </label>
      <Textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={parentId ? "Write a reply" : "Add a comment"}
      />
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" className="self-end" disabled={pending || !body.trim()}>
        {pending ? "Posting…" : parentId ? "Reply" : "Comment"}
      </Button>
    </form>
  );
}
