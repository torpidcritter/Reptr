import { Lock, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { discoverGroups, myGroups, type GroupSummary } from "@/modules/community/groups";
import { myProfile } from "@/modules/social/social";
import { JoinButton, JoinByCode } from "./join-forms";

export const metadata: Metadata = { title: "Groups" };

function GroupRow({ g, children }: { g: GroupSummary; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <Link href={`/groups/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="bg-accent-soft flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Users className="text-accent size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 font-medium">
            <span className="truncate">{g.name}</span>
            {g.visibility === "private" && (
              <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label="Invite only" />
            )}
          </span>
          <span className="text-muted-foreground block text-xs">
            {g.members} {g.members === 1 ? "member" : "members"}
            {g.role === "owner" && " · you own it"}
          </span>
        </span>
      </Link>
      {children}
    </li>
  );
}

async function Groups({ q }: { q: Promise<string> }) {
  const user = await requireUser();
  if (!(await myProfile(db, user.id))) {
    return (
      <EmptyState
        icon={Users}
        title="Train together"
        body="Set up a social profile to create or join a group, with its own leaderboard and challenges."
        action={
          <Link href="/social/profile" className={buttonVariants()}>
            Set up your profile
          </Link>
        }
      />
    );
  }
  const query = await q;
  const [mine, found] = await Promise.all([
    myGroups(db, user.id),
    discoverGroups(db, user.id, query),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <CardLabel>Your groups</CardLabel>
        {mine.length === 0 ? (
          <p className="text-muted-foreground text-sm">You&apos;re not in any groups yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.map((g) => (
              <GroupRow key={g.id} g={g} />
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <JoinByCode />
      </Card>
      <Card className="flex flex-col gap-3">
        <CardLabel>Find a public group</CardLabel>
        <form role="search" className="flex gap-2">
          <label htmlFor="group-q" className="sr-only">
            Group name
          </label>
          <Input id="group-q" name="q" defaultValue={query} placeholder="Group name" />
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Search
          </button>
        </form>
        {found.length === 0 ? (
          <p className="text-muted-foreground text-sm">No public groups found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {found.map((g) => (
              <GroupRow key={g.id} g={g}>
                <JoinButton id={g.id} name={g.name} />
              </GroupRow>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function GroupsPage({ searchParams }: PageProps<"/groups">) {
  const q = searchParams.then((s) => (typeof s.q === "string" ? s.q.slice(0, 40) : ""));
  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Train with a crew, with your own board and challenges"
        action={
          <Link href="/groups/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Groups q={q} />
      </Suspense>
    </>
  );
}
