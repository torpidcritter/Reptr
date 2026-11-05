import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatDuration, formatVolume } from "@/lib/format";
import { listWorkoutHistory } from "@/modules/history/history";

export const metadata: Metadata = { title: "Workout history" };

async function HistoryList() {
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  const [profile, items] = await Promise.all([
    getProfile(user.id),
    listWorkoutHistory(db, user.id, { limit: 200 }),
  ]);
  const units = profile?.unitSystem ?? "metric";
  if (items.length === 0)
    return (
      <EmptyState
        icon={History}
        title="Completed workouts will appear here"
        body="Finish a workout and it's saved here with every set."
        action={
          <Link href="/workout" className={buttonVariants()}>
            Start workout
          </Link>
        }
      />
    );

  const monthOf = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: tz }).format(d);
  const groups: { month: string; items: typeof items }[] = [];
  for (const w of items) {
    const m = monthOf(w.startedAt);
    if (groups.at(-1)?.month !== m) groups.push({ month: m, items: [] });
    groups.at(-1)!.items.push(w);
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.month} aria-label={g.month} className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            {g.month} · {g.items.length} workout{g.items.length === 1 ? "" : "s"}
          </h2>
          {g.items.map((w) => (
            <Link key={w.id} href={`/history/${w.id}`}>
              <Card className="hover:bg-muted transition-colors">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-muted-foreground text-xs">{formatDate(w.startedAt, tz)}</p>
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {[
                    w.finishedAt && formatDuration(w.finishedAt.getTime() - w.startedAt.getTime()),
                    `${w.exerciseNames.length} exercise${w.exerciseNames.length === 1 ? "" : "s"}`,
                    `${w.setCount} sets`,
                    w.volumeKg > 0 && formatVolume(w.volumeKg, units),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
                  {w.exerciseNames.join(", ")}
                </p>
              </Card>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Workout history" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading history…</p>}>
        <HistoryList />
      </Suspense>
    </>
  );
}
