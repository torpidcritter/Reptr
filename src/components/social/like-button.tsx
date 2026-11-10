"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { likeAction } from "@/app/(app)/social/actions";
import { cn } from "@/lib/utils";

export function LikeButton({
  postId,
  liked: initialLiked,
  count: initialCount,
}: {
  postId: string;
  liked: boolean;
  count: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [, start] = useTransition();

  const toggle = () => {
    const next = !liked;
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    start(async () => {
      const res = await likeAction(postId, next);
      if (res.error) {
        setLiked(!next);
        setCount((n) => n + (next ? -1 : 1));
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-sm"
    >
      <Heart className={cn("size-4", liked && "fill-danger text-danger")} />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
