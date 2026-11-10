import { ArrowLeft, CheckCircle2, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dateRange, metricText } from "@/components/community/challenge-card";
import { Avatar, PersonName } from "@/components/social/avatar";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { challengeKinds, getChallenge, metrics } from "@/modules/community/challenges";
import { ChallengeButtons } from "./challenge-buttons";

export const metadata: Metadata = { title: "Challenge" };

async function Challenge({ params }: { params: PageProps<"/challenges/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [view, profile] = await Promise.all([getChallenge(db, user.id, id), getProfile(user.id)]);
  if (!view) notFound();
  const { challenge: c, standings } = view;
  const units = profile?.unitSystem ?? "metric";
  const urls = await avatarUrls(standings.map((s) => s.person.avatarPath));
  const today = new Date().toISOString().slice(0, 10);
  const ended = c.endsOn < today;
  const kind = c.seasonal ? "Seasonal, open to anyone" : challengeKinds[c.visibility];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <Flag className="text-accent mt-1 size-6 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="text-muted-foreground text-sm">
            {dateRange(c)} (UTC){ended && " · ended"} · {kind}
            {c.groupName && (
              <>
                {" · "}
                <Link href={`/groups/${c.groupId}`} className="text-accent">
                  {c.groupName}
                </Link>
              </>
            )}
          </p>
        </div>
      </header>
      {c.description && <p className="text-sm">{c.description}</p>}
      <Card className="text-sm">
        {metrics[c.metric].label}
        {c.target ? `: reach ${metricText(c.metric, c.target, units)}` : ": most wins"}
      </Card>
      <ChallengeButtons
        id={c.id}
        joined={c.joined}
        canJoin={!ended && c.visibility !== "only_me"}
        isCreator={c.creatorId === user.id}
      />
      <section className="flex flex-col gap-2">
        <CardLabel>Standings</CardLabel>
        {standings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody has joined yet.</p>
        ) : (
          <Card className="p-0">
            <ol aria-label="Standings" className="divide-y">
              {standings.map((s) => (
                <li
                  key={s.person.userId}
                  className={cn("flex items-center gap-3 px-4 py-3", s.me && "bg-accent-soft")}
                >
                  <span className="w-8 text-center font-semibold tabular-nums">{s.rank}</span>
                  <Link
                    href={`/u/${s.person.handle}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar
                      name={s.person.displayName}
                      handle={s.person.handle}
                      url={urls.get(s.person.avatarPath ?? "")}
                      size="sm"
                    />
                    <PersonName name={s.person.displayName} handle={s.person.handle} />
                  </Link>
                  {s.completed && (
                    <CheckCircle2 aria-label="Reached the target" className="text-accent size-4" />
                  )}
                  <span className="font-semibold tabular-nums">
                    {metricText(c.metric, s.score, units)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>
    </div>
  );
}

export default function ChallengePage({ params }: PageProps<"/challenges/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/challenges"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Challenges
      </Link>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Challenge params={params} />
      </Suspense>
    </div>
  );
}
