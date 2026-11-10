"use client";

import { Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePostAction, shareWorkoutAction } from "@/app/(app)/social/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/input";

type Visibility = "public" | "followers" | "only_me";

const choices: [Visibility, string][] = [
  ["followers", "Followers"],
  ["public", "Everyone who can see your profile"],
  ["only_me", "Only me"],
];

/**
 * Shares a finished workout to the feed, or changes or removes the post. The server
 * builds what's shown from the saved workout, so this only sends a caption and audience.
 */
export function ShareWorkout({
  workoutId,
  hasProfile,
  post,
}: {
  workoutId: string;
  hasProfile: boolean;
  post: { id: string; visibility: Visibility; caption: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [visibility, setVisibility] = useState<Visibility>(post?.visibility ?? "followers");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();

  if (!hasProfile) {
    return (
      <Link
        href="/social/profile"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        title="Set up a social profile to share workouts"
      >
        <Share2 /> Share
      </Link>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const res = await shareWorkoutAction({ workoutId, caption, visibility });
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });

  const remove = async () => {
    if (!post) return;
    // Asked outside the transition, so the dialog shows straight away.
    const ok = await confirm({
      title: "Remove this post?",
      body: "Its likes and comments go too. The workout itself stays in your history.",
      confirm: "Remove",
    });
    if (!ok) return;
    start(async () => {
      const res = await deletePostAction(post.id);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 /> {post ? "Shared" : "Share"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={post ? "Edit shared workout" : "Share workout"}
      >
        <div className="flex flex-col gap-3">
          <label htmlFor="share-caption" className="text-sm font-medium">
            Caption (optional)
          </label>
          <Textarea
            id="share-caption"
            value={caption}
            maxLength={500}
            rows={3}
            onChange={(e) => setCaption(e.target.value)}
          />
          <label htmlFor="share-visibility" className="text-sm font-medium">
            Who can see it
          </label>
          <Select
            id="share-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            {choices.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <p className="text-muted-foreground text-xs">
            The post shows the workout name, exercises, best sets, volume and records. Notes, body
            weight and photos are never shared.
          </p>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : post ? "Save" : "Share"}
          </Button>
          {post && (
            <Button variant="outline" onClick={remove} disabled={pending}>
              Remove post
            </Button>
          )}
        </div>
      </Dialog>
    </>
  );
}
