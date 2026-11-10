import { ArrowLeft, Flag, Lock, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PersonRow } from "@/components/social/person-row";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { requireUser } from "@/lib/auth";
import { getGroup } from "@/modules/community/groups";
import { GroupForm } from "../group-form";
import { JoinButton } from "../join-forms";
import { InviteCode, LeaveOrDelete, RemoveMember } from "./group-admin";

export const metadata: Metadata = { title: "Group" };

async function Group({ params }: { params: PageProps<"/groups/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const g = await getGroup(db, user.id, id);
  if (!g) notFound();
  const admin = g.role === "owner" || g.role === "admin";
  const urls = await avatarUrls(g.people.map((p) => p.avatarPath));
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {g.name}
            {g.visibility === "private" && (
              <Lock className="text-muted-foreground size-4" aria-label="Invite only" />
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            {g.members} {g.members === 1 ? "member" : "members"}
          </p>
        </div>
        {!g.role && g.visibility === "public" && <JoinButton id={g.id} name={g.name} />}
      </header>
      {g.description && <p className="text-sm">{g.description}</p>}
      {g.role && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leaderboards?scope=group&group=${g.id}&cat=workouts&period=week`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Trophy /> Group leaderboard
          </Link>
          <Link
            href={`/challenges/new?group=${g.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Flag /> Start a group challenge
          </Link>
        </div>
      )}
      {admin && g.inviteCode && (
        <Card>
          <InviteCode id={g.id} code={g.inviteCode} />
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <CardLabel>Members</CardLabel>
        <ul className="flex flex-col gap-3">
          {g.people.map((p) => (
            <PersonRow key={p.userId} card={p} url={urls.get(p.avatarPath ?? "")}>
              {p.role !== "member" && (
                <span className="text-muted-foreground text-xs capitalize">{p.role}</span>
              )}
              {admin && p.role === "member" && (
                <RemoveMember id={g.id} member={p.userId} handle={p.handle} />
              )}
            </PersonRow>
          ))}
        </ul>
      </Card>
      {admin && (
        <Card className="flex flex-col gap-3">
          <CardLabel>Edit group</CardLabel>
          <GroupForm
            id={g.id}
            initial={{ name: g.name, description: g.description ?? "", visibility: g.visibility }}
          />
        </Card>
      )}
      {g.role && <LeaveOrDelete id={g.id} owner={g.role === "owner"} />}
    </div>
  );
}

export default function GroupPage({ params }: PageProps<"/groups/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/groups"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Groups
      </Link>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Group params={params} />
      </Suspense>
    </div>
  );
}
