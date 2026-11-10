import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { myGroups } from "@/modules/community/groups";
import { ChallengeForm } from "./challenge-form";

export const metadata: Metadata = { title: "New challenge" };

async function Form({
  searchParams,
}: {
  searchParams: PageProps<"/challenges/new">["searchParams"];
}) {
  const user = await requireUser();
  const [{ group }, groups, profile] = await Promise.all([
    searchParams,
    myGroups(db, user.id),
    getProfile(user.id),
  ]);
  return (
    <ChallengeForm
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      groupId={typeof group === "string" ? group : undefined}
      units={profile?.unitSystem ?? "metric"}
    />
  );
}

export default function NewChallengePage({ searchParams }: PageProps<"/challenges/new">) {
  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/challenges"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Challenges
      </Link>
      <PageHeader title="New challenge" />
      <Card>
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <Form searchParams={searchParams} />
        </Suspense>
      </Card>
    </div>
  );
}
