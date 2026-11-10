"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { leaveSocialAction } from "../actions";

export function LeaveSocial() {
  const router = useRouter();
  const ask = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const leave = async () => {
    const ok = await ask({
      title: "Leave social features?",
      body: "Your handle, followers, posts, likes and comments are deleted for good. Your workouts and other data stay.",
      confirm: "Leave",
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await leaveSocialAction();
      if (res.error) return setError(res.error);
      router.push("/social");
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="border-danger text-danger self-start"
        onClick={leave}
        disabled={pending}
      >
        Leave social features
      </Button>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
