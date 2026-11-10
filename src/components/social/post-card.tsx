import { MessageCircle, Trophy } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDate, formatDuration, formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel, type UnitSystem } from "@/lib/units";
import { recordLabels } from "@/modules/analytics/calc";
import type { FeedPost } from "@/modules/social/social";
import { Avatar, PersonName } from "./avatar";
import { LikeButton } from "./like-button";
import { PostMenu } from "./post-menu";

const visibilityText = { public: "Public", followers: "Followers", only_me: "Only you" };

/** A shared workout: who, when, what they did, and likes and comments. */
export function PostCard({
  post,
  units,
  timeZone,
  avatarUrl,
  me,
  linkToPost = true,
}: {
  post: FeedPost;
  units: UnitSystem;
  timeZone: string;
  avatarUrl?: string | null;
  me: string;
  linkToPost?: boolean;
}) {
  const s = post.summary;
  const unit = weightUnitLabel(units);
  const mine = post.author.userId === me;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Link href={`/u/${post.author.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={post.author.displayName} handle={post.author.handle} url={avatarUrl} />
          <PersonName name={post.author.displayName} handle={post.author.handle} />
        </Link>
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatDate(post.createdAt, timeZone)}
          {mine && ` · ${visibilityText[post.visibility]}`}
        </span>
        <PostMenu postId={post.id} authorId={post.author.userId} mine={mine} />
      </div>
      {post.caption && <p className="text-sm whitespace-pre-line">{post.caption}</p>}
      <div className="bg-muted/50 flex flex-col gap-2 rounded-xl p-3">
        <p className="font-semibold">{s.name}</p>
        <p className="text-muted-foreground text-sm">
          {formatDuration(s.durationSeconds * 1000)} · {s.workingSets} set
          {s.workingSets === 1 ? "" : "s"}
          {s.volumeKg > 0 && ` · ${formatVolume(s.volumeKg, units)}`}
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {s.exercises.slice(0, 5).map((e, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{e.name}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {e.sets} {e.sets === 1 ? "set" : "sets"}
                {e.best &&
                  ` · best ${displayWeight(e.best.weightKg, units, 1)} ${unit} × ${e.best.reps}`}
              </span>
            </li>
          ))}
          {s.exercises.length > 5 && (
            <li className="text-muted-foreground">and {s.exercises.length - 5} more</li>
          )}
        </ul>
        {s.records.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Personal records">
            {s.records.slice(0, 4).map((r, i) => (
              <li
                key={i}
                className="bg-accent-soft text-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                <Trophy className="size-3" /> {r.exercise}: {recordLabels[r.type].toLowerCase()}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-4">
        <LikeButton postId={post.id} liked={post.likedByMe} count={post.likes} />
        {linkToPost ? (
          <Link
            href={`/social/post/${post.id}`}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-sm"
            aria-label={`${post.comments} comments`}
          >
            <MessageCircle className="size-4" />
            <span className="tabular-nums">{post.comments}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <MessageCircle className="size-4" /> {post.comments}
          </span>
        )}
      </div>
    </Card>
  );
}
