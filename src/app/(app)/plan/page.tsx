import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDuration, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthGrid, monthKey, parseMonth } from "@/modules/history/calendar";
import { listWorkoutHistory } from "@/modules/history/history";
import { addDays, plannedByWeekday, weekdayNames, weekdayOf } from "@/modules/history/schedule";
import { blockWeek } from "@/modules/programs/block";
import { activeProgram } from "@/modules/programs/programs";
import { listRoutines } from "@/modules/routines/routines";

export const metadata: Metadata = { title: "Plan" };

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function PlanView({ searchParams }: Pick<PageProps<"/plan">, "searchParams">) {
  const [params, user, tz] = await Promise.all([searchParams, requireUser(), getTimeZone()]);
  const profile = await getProfile(user.id);
  const units = profile?.unitSystem ?? "metric";
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const today = dayOf(new Date());
  const selected = isDay(params.day) ? params.day : today;
  const { year, month } = parseMonth(
    typeof params.month === "string" ? params.month : selected.slice(0, 7),
  );
  const key = monthKey(year, month);

  // A day either side covers every time zone; workouts are then placed on local days.
  const grid = monthGrid(year, month);
  const first = grid[0][0].date;
  const last = grid[grid.length - 1][6].date;
  const weekStart = addDays(today, -weekdayOf(today));
  const from = new Date(Date.parse(`${[first, weekStart].sort()[0]}T00:00:00Z`) - 86400000);
  const to = new Date(
    Date.parse(`${[last, addDays(weekStart, 7)].sort()[1]}T00:00:00Z`) + 86400000,
  );
  const [all, routines, program] = await Promise.all([
    listWorkoutHistory(db, user.id, { from, to }),
    listRoutines(db, user.id),
    activeProgram(db, user.id),
  ]);
  const byDay = new Map<string, typeof all>();
  for (const w of all) {
    const d = dayOf(w.startedAt);
    byDay.set(d, [...(byDay.get(d) ?? []), w]);
  }
  const planned = plannedByWeekday(routines);
  const hasRoutinePlan = planned.some((p) => p.length > 0);
  // Without scheduled routines, fall back to the training days picked in settings (as Today does).
  const settingsDays = hasRoutinePlan ? [] : (profile?.trainingDays ?? []);
  const isTrainingDay = (wd: number) => planned[wd].length > 0 || settingsDays.includes(wd);
  const hasPlan = hasRoutinePlan || settingsDays.length > 0;

  // This week: planned days so far and how many of them had a workout.
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const doneThisWeek = week.filter((d) => byDay.has(d)).length;
  const plannedThisWeek = week.filter((d) => isTrainingDay(weekdayOf(d))).length;

  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
  const selectedLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${selected}T00:00:00Z`));
  const dayWorkouts = byDay.get(selected) ?? [];
  const dayPlan = selected >= today ? planned[weekdayOf(selected)] : [];
  const block = program && blockWeek(program, today);
  const href = (q: Record<string, string>) => `/plan?${new URLSearchParams(q)}`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground -mt-3 text-sm">
        This week: {doneThisWeek} workout{doneThisWeek === 1 ? "" : "s"}
        {plannedThisWeek > 0 && ` of ${plannedThisWeek} planned`}
        {program && block?.status === "active" && (
          <>
            {" · "}
            <Link href="/programs" className="text-foreground underline-offset-4 hover:underline">
              {program.name}, week {block.week} of {program.weeks}
              {block.kind === "deload" && " (lighter week)"}
            </Link>
          </>
        )}
      </p>

      <section aria-label="Calendar">
        <div className="mb-2 flex items-center justify-between">
          <Link
            href={href({ month: monthKey(year, month - 1) })}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Link>
          <h2 className="font-semibold">{label}</h2>
          <Link
            href={href({ month: monthKey(year, month + 1) })}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next month"
          >
            <ChevronRight />
          </Link>
        </div>
        <div className="grid grid-cols-7 text-center text-sm" role="grid">
          {weekdayNames.map((d) => (
            <span key={d} className="text-muted-foreground pb-2 text-xs font-medium">
              {d.slice(0, 1)}
            </span>
          ))}
          {grid.flat().map((d) => {
            const trained = byDay.has(d.date);
            const isPlanned = !trained && d.date >= today && isTrainingDay(weekdayOf(d.date));
            const isSelected = d.date === selected;
            return (
              <Link
                key={d.date}
                href={href({ month: key, day: d.date })}
                scroll={false}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${d.date}${trained ? ", trained" : isPlanned ? ", planned" : ""}`}
                className="flex flex-col items-center gap-1 py-1"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full tabular-nums transition-colors",
                    !d.inMonth && "text-muted-foreground/50",
                    trained && "bg-accent text-accent-foreground font-semibold",
                    !trained && d.date === today && "text-accent font-semibold",
                    isSelected && "ring-foreground ring-2",
                  )}
                >
                  {Number(d.date.slice(8))}
                </span>
                <span
                  className={cn("size-1 rounded-full", isPlanned ? "bg-accent" : "bg-transparent")}
                />
              </Link>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-2.5 rounded-full" /> Trained
          </span>
          {hasPlan && (
            <span className="flex items-center gap-1.5">
              <span className="bg-accent size-1 rounded-full" /> Planned
            </span>
          )}
        </p>
      </section>

      <section aria-labelledby="day-title" className="flex flex-col gap-2">
        <h2 id="day-title" className="font-semibold">
          {selected === today ? "Today" : selectedLabel}
        </h2>
        {dayWorkouts.map((w) => (
          <Link key={w.id} href={`/history/${w.id}`}>
            <Card className="hover:bg-muted transition-colors">
              <p className="font-medium">{w.name}</p>
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
        {dayWorkouts.length === 0 &&
          (dayPlan.length > 0 ? (
            dayPlan.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Planned</p>
                  <p className="font-medium">{r.name}</p>
                </div>
                {selected === today && (
                  <Link
                    href={`/workout?routine=${r.id}`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    <Play /> Start
                  </Link>
                )}
              </Card>
            ))
          ) : selected >= today && settingsDays.includes(weekdayOf(selected)) ? (
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">Planned</p>
                <p className="font-medium">Training day</p>
              </div>
              {selected === today && (
                <Link href="/workout" className={buttonVariants({ size: "sm" })}>
                  <Play /> Start
                </Link>
              )}
            </Card>
          ) : (
            <p className="text-muted-foreground text-sm">
              {selected >= today ? "Nothing planned." : "No workout this day."}
            </p>
          ))}
      </section>

      <section aria-labelledby="week-title" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="week-title" className="font-semibold">
            Weekly schedule
          </h2>
          <Link href="/routines" className="text-accent text-sm font-medium">
            Edit routines
          </Link>
        </div>
        {hasRoutinePlan ? (
          <ul className="divide-y rounded-xl border">
            {planned.map((rs, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground w-10">{weekdayNames[i]}</span>
                <span className={rs.length ? "font-medium" : "text-muted-foreground"}>
                  {rs.length ? rs.map((r) => r.name).join(", ") : "Rest"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {settingsDays.length > 0 &&
              `You train on ${settingsDays.map((d) => weekdayNames[d]).join(", ")}. `}
            Pick training days on a routine and they show up here and on the calendar.
          </p>
        )}
      </section>

      <nav aria-label="More planning" className="grid gap-2 sm:grid-cols-2">
        {[
          ["/programs", "Training block", "Several weeks with planned lighter weeks"],
          ["/goals", "Goals", "Targets for lifts, body weight and consistency"],
        ].map(([to, title, body]) => (
          <Link key={to} href={to}>
            <Card className="hover:bg-muted flex items-center gap-3 transition-colors">
              <div className="flex-1">
                <p className="font-medium">{title}</p>
                <p className="text-muted-foreground text-sm">{body}</p>
              </div>
              <ChevronRight className="text-muted-foreground size-4" />
            </Card>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function PlanPage({ searchParams }: PageProps<"/plan">) {
  return (
    <>
      <PageHeader title="Plan" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading your plan…</p>}>
        <PlanView searchParams={searchParams} />
      </Suspense>
    </>
  );
}
