import { Info, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pills } from "@/components/community/pills";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, PersonName } from "@/components/social/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, requireUser } from "@/lib/auth";
import { formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { myGroups } from "@/modules/community/groups";
import { BOARD_SIZE, exerciseBoards, leaderboard } from "@/modules/community/leaderboards";
import {
  categories,
  isBaseCategory,
  periodLabels,
  periods,
  type Period,
} from "@/modules/community/scoring";
import { myProfile } from "@/modules/social/social";

export const metadata: Metadata = { title: "Leaderboards" };

type Params = { scope: string; cat: string; period: Period; group?: string };

function scoreText(category: string, score: number, units: UnitSystem) {
  if (category === "volume") return formatVolume(score, units);
  if (category.startsWith("e1rm:"))
    return `${displayWeight(score, units, 1)} ${weightUnitLabel(units)}`;
  if (category === "minutes") return `${score.toLocaleString("en")} min`;
  if (category === "streak") return `${score} ${score === 1 ? "week" : "weeks"}`;
  if (category === "xp") return `${score.toLocaleString("en")} XP`;
  return score.toLocaleString("en");
}

async function Board({ params }: { params: Promise<Params> }) {
  const p = await params;
  const user = await requireUser();
  const me = await myProfile(db, user.id);
  if (!me) {
    return (
      <EmptyState
        icon={Trophy}
        title="Compare with friends"
        body="Leaderboards are part of social features. Set up a profile, then choose whether to appear on them."
        action={
          <Link href="/social/profile" className={buttonVariants()}>
            Set up your profile
          </Link>
        }
      />
    );
  }
  const [profile, groups, lifts] = await Promise.all([
    getProfile(user.id),
    myGroups(db, user.id),
    exerciseBoards(db),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const group = groups.find((g) => g.id === p.group);
  const scope =
    p.scope === "group" && group ? "group" : p.scope === "global" ? "global" : "friends";
  const lift = lifts.find((l) => l.category === p.cat);
  const category = isBaseCategory(p.cat) || lift ? p.cat : "workouts";
  const rows = await leaderboard(db, user.id, {
    category,
    period: p.period,
    scope,
    groupId: scope === "group" ? group?.id : undefined,
  });
  const urls = await avatarUrls(rows.map((r) => r.person.avatarPath));

  const href = (change: Partial<Params>) => {
    const next = { ...p, scope, cat: category, ...change };
    const q = new URLSearchParams({ scope: next.scope, cat: next.cat, period: next.period });
    if (next.scope === "group" && next.group) q.set("group", next.group);
    return `/leaderboards?${q}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {!me.leaderboards && (
        <Card className="flex items-start gap-3 text-sm">
          <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p>
            You&apos;re not on leaderboards, so nobody sees your numbers here.{" "}
            <Link href="/social/profile" className="text-accent font-medium">
              Join in from your social profile
            </Link>
            .
          </p>
        </Card>
      )}

      <Pills
        label="Who"
        options={[
          { href: href({ scope: "friends" }), label: "Friends", current: scope === "friends" },
          { href: href({ scope: "global" }), label: "Everyone", current: scope === "global" },
          ...groups.map((g) => ({
            href: href({ scope: "group", group: g.id }),
            label: g.name,
            current: scope === "group" && group?.id === g.id,
          })),
        ]}
      />
      <Pills
        label="What"
        options={[
          ...Object.entries(categories).map(([key, c]) => ({
            href: href({ cat: key }),
            label: c.label,
            current: category === key,
          })),
          ...lifts.map((l) => ({
            href: href({ cat: l.category }),
            label: `${l.name} 1RM`,
            current: category === l.category,
          })),
        ]}
      />
      {category !== "streak" && (
        <Pills
          label="When"
          options={periods.map((key) => ({
            href: href({ period: key }),
            label: periodLabels[key],
            current: p.period === key,
          }))}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No one on this board yet"
          body={
            scope === "friends"
              ? "Follow people who are on leaderboards, or try Everyone."
              : "Finished workouts in this period will show up here."
          }
        />
      ) : (
        <Card className="p-0">
          <ol aria-label="Standings" className="divide-y">
            {rows.map((r) => (
              <li
                key={r.person.userId}
                className={cn("flex items-center gap-3 px-4 py-3", r.me && "bg-accent-soft")}
              >
                <span className="w-8 text-center font-semibold tabular-nums">{r.rank}</span>
                <Link
                  href={`/u/${r.person.handle}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar
                    name={r.person.displayName}
                    handle={r.person.handle}
                    url={urls.get(r.person.avatarPath ?? "")}
                    size="sm"
                  />
                  <PersonName name={r.person.displayName} handle={r.person.handle} />
                </Link>
                <span className="font-semibold tabular-nums">
                  {scoreText(category, r.score, units)}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <p className="text-muted-foreground text-xs">
        Top {BOARD_SIZE}. Scored on the server from saved workouts, the same way for everyone. Weeks
        and months are in UTC.{" "}
        <Link href="/leaderboards/rules" className="text-accent font-medium">
          How scoring works
        </Link>
      </p>
    </div>
  );
}

export default function LeaderboardsPage({ searchParams }: PageProps<"/leaderboards">) {
  const params = searchParams.then((s) => ({
    scope: typeof s.scope === "string" ? s.scope : "friends",
    cat: typeof s.cat === "string" ? s.cat : "workouts",
    period: (periods as readonly string[]).includes(String(s.period))
      ? (s.period as Period)
      : "week",
    group: typeof s.group === "string" ? s.group : undefined,
  }));
  return (
    <>
      <PageHeader title="Leaderboards" subtitle="How you compare, from saved workouts" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Board params={params} />
      </Suspense>
    </>
  );
}
