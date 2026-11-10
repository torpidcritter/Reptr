import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { PersonMenu } from "@/components/social/person-menu";
import { PostCard } from "@/components/social/post-card";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { myProfile, postsBy, profileByHandle } from "@/modules/social/social";

export const metadata: Metadata = { title: "Profile" };

async function Profile({ params }: { params: PageProps<"/u/[handle]">["params"] }) {
  const { handle } = await params;
  const user = await requireUser();
  if (!(await myProfile(db, user.id))) redirect("/social/profile");
  const found = await profileByHandle(db, user.id, decodeURIComponent(handle));
  // Missing, or hidden because of a block: the same answer either way.
  if (!found) notFound();
  const { card, relationship: rel, counts } = found;
  const [profile, tz, page] = await Promise.all([
    getProfile(user.id),
    getTimeZone(),
    rel.canSee ? postsBy(db, user.id, card.userId) : Promise.resolve({ posts: [], next: null }),
  ]);
  const urls = await avatarUrls([card.avatarPath]);
  const url = urls.get(card.avatarPath ?? "");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Avatar name={card.displayName} handle={card.handle} url={url} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">
              {card.displayName || `@${card.handle}`}
            </h2>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              @{card.handle}
              {card.visibility === "private" && (
                <Lock className="size-3.5" aria-label="Private account" />
              )}
              {rel.followsYou && !rel.self && (
                <span className="bg-muted ml-1 rounded px-1.5 text-xs">Follows you</span>
              )}
            </p>
            {card.bio && <p className="mt-2 text-sm whitespace-pre-line">{card.bio}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            {rel.canSee ? (
              <>
                <Link href={`/u/${card.handle}/followers`} className="hover:underline">
                  <strong className="tabular-nums">{counts.followers}</strong> followers
                </Link>
                <Link href={`/u/${card.handle}/following`} className="hover:underline">
                  <strong className="tabular-nums">{counts.following}</strong> following
                </Link>
              </>
            ) : (
              <>
                <span>
                  <strong className="tabular-nums">{counts.followers}</strong> followers
                </span>
                <span>
                  <strong className="tabular-nums">{counts.following}</strong> following
                </span>
              </>
            )}
          </div>
          {rel.self ? (
            <Link
              href="/social/profile"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit profile
            </Link>
          ) : (
            <div className="flex items-start gap-2">
              <FollowButton
                userId={card.userId}
                handle={card.handle}
                isPrivate={card.visibility === "private"}
                initial={rel.following ? "following" : rel.requested ? "requested" : "none"}
              />
              <PersonMenu userId={card.userId} handle={card.handle} followsYou={rel.followsYou} />
            </div>
          )}
        </div>
        {rel.requestedYou && (
          <Link href="/social/requests" className="text-accent text-sm font-medium">
            @{card.handle} asked to follow you. Answer in Requests.
          </Link>
        )}
      </Card>

      {!rel.canSee ? (
        <EmptyState
          icon={Lock}
          title="This account is private"
          body={
            rel.requested
              ? "Your request is waiting. You'll see their workouts once they accept."
              : "Follow them to see the workouts they share."
          }
        />
      ) : page.posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No shared workouts yet.</p>
      ) : (
        page.posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            units={profile?.unitSystem ?? "metric"}
            timeZone={tz}
            avatarUrl={url}
            me={user.id}
          />
        ))
      )}
    </div>
  );
}

export default function UserPage({ params }: PageProps<"/u/[handle]">) {
  return (
    <>
      <PageHeader title="Profile" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Profile params={params} />
      </Suspense>
    </>
  );
}
