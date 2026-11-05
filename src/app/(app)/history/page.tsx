import { CalendarDays, ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel, CardValue } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatDuration, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthGrid, monthKey, parseMonth } from "@/modules/history/calendar";
import { listWorkoutHistory, trainingDays } from "@/modules/history/history";
import {
  addDays,
  datesBetween,
  plannedByWeekday,
  scheduleAdherence,
  weekdayOf,
} from "@/modules/history/schedule";
import { listRoutines } from "@/modules/routines/routines";

export const metadata: Metadata = { title: "History" };

async function HistoryMonth({ searchParams }: Pick<PageProps<"/history">, "searchParams">) {
  const [{ month: monthParam }, user, tz] = await Promise.all([
    searchParams,
    requireUser(),
    getTimeZone(),
  ]);
  const profile = await getProfile(user.id);
  const units = profile?.unitSystem ?? "metric";
  const { year, month } = parseMonth(typeof monthParam === "string" ? monthParam : undefined);

  // A day either side covers every time zone; the list is then filtered to local days.
  const from = new Date(Date.UTC(year, month, 1) - 86400000);
  const to = new Date(Date.UTC(year, month + 1, 1) + 86400000);
  const key = monthKey(year, month);
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const today = dayOf(new Date());
  // The last four full weeks before today, for how well the plan was kept.
  const windowStart = addDays(today, -28);
  const [all, routines, recentDays] = await Promise.all([
    listWorkoutHistory(db, user.id, { from, to }),
    listRoutines(db, user.id),
    trainingDays(
      db,
      user.id,
      new Date(Date.parse(`${windowStart}T00:00:00Z`) - 86400000),
      new Date(),
      tz,
    ),
  ]);
  const items = all.filter((w) => dayOf(w.startedAt).startsWith(key));
  const days = new Set(items.map((w) => dayOf(w.startedAt)));
  const recent = new Set(recentDays);
  const planned = plannedByWeekday(routines);
  const plannedDays = new Set(planned.flatMap((rs, i) => (rs.length ? [i] : [])));
  // Only judge the days since the current plan was set.
  const planSince = routines
    .filter((r) => r.scheduleDays.length && r.scheduleSetAt)
    .map((r) => dayOf(r.scheduleSetAt!))
    .sort()[0];
  const keptFrom = planSince && planSince > windowStart ? planSince : windowStart;
  const kept = scheduleAdherence(datesBetween(keptFrom, addDays(today, -1)), plannedDays, recent);
  const todayPlan = planned[weekdayOf(today)];
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));

  return (
    <>
      {(kept.percent != null || todayPlan.length > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {kept.percent != null && kept.planned > 0 && (
            <Card>
              <CardLabel>
                Plan kept, {keptFrom === windowStart ? "last 4 weeks" : "since you set it"}
              </CardLabel>
              <CardValue>{kept.percent}%</CardValue>
              <p className="text-muted-foreground mt-1 text-sm">
                {kept.done} of {kept.planned} planned days
                {kept.extra > 0 && `, plus ${kept.extra} extra`}
              </p>
            </Card>
          )}
          {todayPlan.length > 0 && !days.has(today) && (
            <Card>
              <CardLabel>Planned today</CardLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {todayPlan.map((r) => (
                  <Link
                    key={r.id}
                    href={`/workout?routine=${r.id}`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    <Play /> {r.name}
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <Link
            href={`/history?month=${monthKey(year, month - 1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Link>
          <p className="font-semibold">
            {label} · {items.length} workout{items.length === 1 ? "" : "s"}
          </p>
          <Link
            href={`/history?month=${monthKey(year, month + 1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next month"
          >
            <ChevronRight />
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-muted-foreground pb-1 font-medium">
              {d}
            </span>
          ))}
          {monthGrid(year, month)
            .flat()
            .map((d) => {
              const trained = days.has(d.date) || recent.has(d.date);
              const plan = planned[weekdayOf(d.date)];
              // Past days before the plan existed weren't planned.
              const beforePlan = d.date < today && (!planSince || d.date < planSince);
              const isPlanned = plan.length > 0 && !trained && !beforePlan;
              const missed = isPlanned && d.date < today;
              return (
                <span
                  key={d.date}
                  title={plan.length ? `Planned: ${plan.map((r) => r.name).join(", ")}` : undefined}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg tabular-nums",
                    !d.inMonth && "opacity-30",
                    trained && "bg-accent text-accent-foreground font-semibold",
                    isPlanned && !missed && "border-accent border border-dashed",
                    missed && "text-muted-foreground line-through",
                    d.date === today && !trained && "ring-accent ring-2",
                  )}
                  aria-label={
                    trained
                      ? `${d.date}: trained`
                      : missed
                        ? `${d.date}: planned, missed`
                        : isPlanned
                          ? `${d.date}: planned`
                          : d.date
                  }
                >
                  {Number(d.date.slice(8))}
                </span>
              );
            })}
        </div>
        {plannedDays.size > 0 && (
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="bg-accent size-3 rounded" /> Trained
            </span>
            <span className="flex items-center gap-1.5">
              <span className="border-accent size-3 rounded border border-dashed" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="line-through">12</span> Missed
            </span>
          </div>
        )}
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No workouts this month"
          body="Finished workouts show up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((w) => (
            <Link key={w.id} href={`/history/${w.id}`}>
              <Card className="hover:bg-muted transition-colors">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-muted-foreground text-xs">{formatDate(w.startedAt, tz)}</p>
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {[
                    w.finishedAt && formatDuration(w.finishedAt.getTime() - w.startedAt.getTime()),
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
        </div>
      )}
    </>
  );
}

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Your plan and every workout you've finished" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading history…</p>}>
        <HistoryMonth searchParams={searchParams} />
      </Suspense>
    </>
  );
}
