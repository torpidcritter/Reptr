"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { answerRequestAction } from "../actions";

export function AnswerRequest({ requester, handle }: { requester: string; handle: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      await answerRequestAction(requester, accept);
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => answer(true)}
        disabled={pending}
        aria-label={`Accept @${handle}`}
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => answer(false)}
        disabled={pending}
        aria-label={`Decline @${handle}`}
      >
        Decline
      </Button>
    </div>
  );
}
