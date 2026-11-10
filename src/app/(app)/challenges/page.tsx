import { Flag, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChallengeCard } from "@/components/community/challenge-card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { log } from "@/lib/log";
import { ensureSeasonal, listChallenges } from "@/modules/community/challenges";
import { myProfile } from "@/modules/social/social";

export const metadata: Metadata = { title: "Challenges" };

async function Challenges() {
  const user = await requireUser();
  const me = await myProfile(db, user.id);
  if (!me) {
    return (
      <EmptyState
        icon={Flag}
        title="Challenge yourself and friends"
        body="Set up a social profile to join this month's challenge, or start your own with friends or a group."
        action={
          <Link href="/social/profile" className={buttonVariants()}>
            Set up your profile
          </Link>
        }
      />
    );
  }
  await ensureSeasonal(db).catch((err) => log.warn("seasonal_challenge_failed", { err }));
  const [profile, { mine, open }] = await Promise.all([
    getProfile(user.id),
    listChallenges(db, user.id),
  ]);
  const units = profile?.unitSystem ?? "metric";
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <CardLabel>Yours</CardLabel>
        {mine.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You&apos;re not in any challenges yet. Join one below, or start your own.
          </p>
        ) : (
          mine.map((c) => <ChallengeCard key={c.id} c={c} units={units} />)
        )}
      </section>
      <section className="flex flex-col gap-3">
        <CardLabel>Open to join</CardLabel>
        {open.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing open right now.</p>
        ) : (
          open.map((c) => <ChallengeCard key={c.id} c={c} units={units} />)
        )}
      </section>
    </div>
  );
}

export default function ChallengesPage() {
  return (
    <>
      <PageHeader
        title="Challenges"
        subtitle="Scored from your saved workouts"
        action={
          <Link href="/challenges/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Challenges />
      </Suspense>
    </>
  );
}
