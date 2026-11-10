"use client";

import { useState, useTransition } from "react";
import { reportAction } from "@/app/(app)/social/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/input";

const reasons = [
  ["spam", "Spam"],
  ["harassment", "Harassment or bullying"],
  ["hate", "Hate speech"],
  ["sexual_content", "Sexual content"],
  ["self_harm", "Self-harm or dangerous advice"],
  ["impersonation", "Pretending to be someone else"],
  ["cheating", "Fake or impossible numbers"],
  ["other", "Something else"],
] as const;

/** Reports a person, or one of their posts or comments, for review. */
export function ReportDialog({
  open,
  onClose,
  target,
  what,
}: {
  open: boolean;
  onClose: () => void;
  target: { userId: string; postId?: string; commentId?: string };
  what: string;
}) {
  const [reason, setReason] = useState<(typeof reasons)[number][0]>("spam");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      const res = await reportAction({
        targetUserId: target.userId,
        postId: target.postId ?? null,
        commentId: target.commentId ?? null,
        reason,
        details,
      });
      if (res.error) return setError(res.error);
      setDone(true);
    });

  return (
    <Dialog open={open} onClose={onClose} title={`Report ${what}`}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Thanks. It will be reviewed. You can also block them so neither of you sees the other.
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="report-reason" className="text-sm font-medium">
            What&apos;s wrong?
          </label>
          <Select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <label htmlFor="report-details" className="text-sm font-medium">
            Anything else? (optional)
          </label>
          <Textarea
            id="report-details"
            value={details}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDetails(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <Button onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Send report"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
