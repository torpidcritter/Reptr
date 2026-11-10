import { Inbox, Search, UserCog, Users, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, PersonName } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { PostCard } from "@/components/social/post-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { feed, incomingRequests, myProfile, suggestions } from "@/modules/social/social";

export const metadata: Metadata = { title: "Social" };

async function Feed({ after }: { after?: string }) {
  const user = await requireUser();
  const me = await myProfile(db, user.id);
  if (!me) {
    return (
      <EmptyState
        icon={Users}
        title="Train with friends"
        body="Pick a handle to follow friends, share workouts and cheer each other on. Nothing you log is shared unless you choose to share it."
        action={
          <Link href="/social/profile" className={buttonVariants()}>
            Set up your profile
          </Link>
        }
      />
    );
  }
  const cursor = parseCursor(after);
  const [profile, tz, page, requests, people] = await Promise.all([
    getProfile(user.id),
    getTimeZone(),
    feed(db, user.id, cursor),
    incomingRequests(db, user.id),
    cursor ? Promise.resolve([]) : suggestions(db, user.id),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const urls = await avatarUrls([
    ...page.posts.map((p) => p.author.avatarPath),
    ...people.map((p) => p.avatarPath),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/social/search" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Search /> Find people
        </Link>
        <Link
          href="/social/requests"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Inbox /> Requests{requests.length > 0 && ` (${requests.length})`}
        </Link>
        <Link href="/groups" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <UsersRound /> Groups
        </Link>
        <Link
          href={`/u/${me.handle}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <UserCog /> Your profile
        </Link>
      </div>

      {people.length > 0 && (
        <Card className="flex flex-col gap-3">
          <CardLabel>People you may know</CardLabel>
          <ul className="flex flex-col gap-3">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-3">
                <Link href={`/u/${p.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar
                    name={p.displayName}
                    handle={p.handle}
                    url={urls.get(p.avatarPath ?? "")}
                  />
                  <PersonName name={p.displayName} handle={p.handle} />
                </Link>
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  {p.mutual} you follow {p.mutual === 1 ? "follows" : "follow"} them
                </span>
                <FollowButton
                  userId={p.userId}
                  handle={p.handle}
                  initial="none"
                  isPrivate={p.visibility === "private"}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {page.posts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={cursor ? "That's everything" : "Nothing here yet"}
          body="Workouts you share, and those shared by people you follow, show up here. Share a workout from its page in History."
          action={
            <Link href="/social/search" className={buttonVariants({ variant: "outline" })}>
              Find people to follow
            </Link>
          }
        />
      ) : (
        page.posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            units={units}
            timeZone={tz}
            avatarUrl={urls.get(p.author.avatarPath ?? "")}
            me={user.id}
          />
        ))
      )}
      {page.next && (
        <Link
          href={`/social?after=${encodeURIComponent(`${page.next.createdAt}_${page.next.id}`)}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Older posts
        </Link>
      )}
    </div>
  );
}

function parseCursor(after?: string) {
  const m = after?.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/);
  return m ? { createdAt: m[1], id: m[2] } : undefined;
}

export default async function SocialPage({ searchParams }: PageProps<"/social">) {
  return (
    <>
      <PageHeader title="Social" subtitle="Workouts from you and the people you follow" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <FeedFromParams searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FeedFromParams({
  searchParams,
}: {
  searchParams: PageProps<"/social">["searchParams"];
}) {
  const { after } = await searchParams;
  return <Feed after={typeof after === "string" ? after : undefined} />;
}
