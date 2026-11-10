import { Bot, Dumbbell, HeartPulse, ListPlus, Play, Salad, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "@/components/layout/notification-bell";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogWeightButton } from "@/components/body/log-weight";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatRecord } from "@/lib/format";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import { localDay } from "@/modules/analytics/insights";
import { recentRecords } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
import { fatigueFor } from "@/modules/coach/fatigue-queries";
import { nextRoutine } from "@/modules/dashboard/dashboard";
import { listWorkoutHistory, trainingDays } from "@/modules/history/history";
import { addDays, plannedByWeekday, weekdayNames, weekdayOf } from "@/modules/history/schedule";
import { listRoutines } from "@/modules/routines/routines";

function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function Dashboard() {
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  await connection(); // "today" depends on the request time
  const now = new Date();
  const today = localDay(now, tz);
  const weekStart = addDays(today, -weekdayOf(today));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [profile, next, routines, done, recent, weights, records, fatigue] = await Promise.all([
    getProfile(user.id),
    nextRoutine(db, user.id, weekdayOf(today)),
    listRoutines(db, user.id),
    trainingDays(
      db,
      user.id,
      new Date(Date.parse(`${weekStart}T00:00:00Z`) - 86400000),
      new Date(Date.parse(`${addDays(weekStart, 7)}T00:00:00Z`) + 86400000),
      tz,
    ),
    listWorkoutHistory(db, user.id, { limit: 1 }),
    metricSeries(db, user.id, "weight", new Date(now.getTime() - 60 * 86400000)),
    recentRecords(db, user.id, 10),
    fatigueFor(db, user.id, tz),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const quickCount = 1 + (profile?.trackNutrition ? 1 : 0) + (profile?.trackRecovery ? 1 : 0);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(
      now,
    ),
  );
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);

  // Which days this week are training days: routines planned on them, else the days
  // picked in onboarding.
  const planned = plannedByWeekday(routines);
  const plannedDays = planned.some((p) => p.length)
    ? planned.map((p) => p.length > 0)
    : Array.from({ length: 7 }, (_, i) => profile?.trainingDays?.includes(i) ?? false);
  const doneDays = new Set(done);
  const doneThisWeek = week.filter((d) => doneDays.has(d)).length;
  const target = plannedDays.filter(Boolean).length || profile?.trainingDaysPerWeek || 0;
  const plannedToday = next?.plannedToday ? next : null;
  const trainedToday = doneDays.has(today);
  const isNew = recent.length === 0;

  // One insight, the most useful available, and only from real data.
  const trend = trendLine(dailyReadings(weights));
  const rate = weeklyRate(trend);
  const lastWeek = new Date(now.getTime() - 7 * 86400000);
  const freshRecord = records.find(
    (r) => r.achievedAt >= lastWeek && (r.type === "best_e1rm" || r.type === "heaviest_weight"),
  );
  const kg = (v: number, d = 1) => `${displayWeight(v, units, d)} ${weightUnitLabel(units)}`;
  const insight =
    fatigue.level === "deload"
      ? {
          href: "/recovery",
          text: `Time for a lighter week? ${fatigue.reasons.length} signs of built-up fatigue.`,
        }
      : freshRecord
        ? {
            href: `/exercises/${freshRecord.exerciseId}`,
            text: `New best on ${freshRecord.exercise}: ${formatRecord(freshRecord.type, freshRecord.value, units)}${freshRecord.type === "best_e1rm" ? " estimated max" : ""}.`,
          }
        : rate != null && Math.abs(rate) >= 0.05
          ? {
              href: "/physique",
              text: `Your weight is trending ${rate > 0 ? "up" : "down"} ${kg(Math.abs(rate), 2)} a week.`,
            }
          : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">{dateLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting(hour)}
            {profile?.displayName ? `, ${profile.displayName}` : ""}
          </h1>
        </div>
        <NotificationBell />
      </header>

      {isNew ? (
        <EmptyState
          icon={Dumbbell}
          title="Your training journey starts here"
          body="Start a workout and add exercises as you go, or build a routine you can repeat."
          action={
            <>
              <Link href="/workout" className={buttonVariants({ size: "lg" })}>
                <Play /> Start workout
              </Link>
              <Link
                href="/routines/new"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <ListPlus /> Create routine
              </Link>
            </>
          }
        />
      ) : (
        <section aria-label="Today's training" className="flex flex-col gap-2">
          {plannedToday && !trainedToday && (
            <p className="text-sm">
              <span className="text-muted-foreground">Planned today: </span>
              <span className="font-semibold">{plannedToday.name}</span>
            </p>
          )}
          <Link
            href={
              plannedToday && !trainedToday ? `/workout?routine=${plannedToday.id}` : "/workout"
            }
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            <Play />
            {plannedToday && !trainedToday ? `Start ${plannedToday.name}` : "Start workout"}
          </Link>
          {plannedToday && !trainedToday && (
            <Link href="/workout" className="text-accent self-center text-sm font-medium">
              Start a different workout
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="week-title">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="week-title" className="font-semibold">
            This week
          </h2>
          <Link href="/plan" className="text-muted-foreground text-sm">
            {doneThisWeek}
            {target ? ` of ${target}` : ""} workout{(target || doneThisWeek) === 1 ? "" : "s"}
          </Link>
        </div>
        <ol className="grid grid-cols-7 gap-1 text-center">
          {week.map((d, i) => {
            const trained = doneDays.has(d);
            const isPlanned = plannedDays[i];
            return (
              <li key={d} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "text-xs",
                    d === today ? "text-foreground font-semibold" : "text-muted-foreground",
                  )}
                >
                  {weekdayNames[i].slice(0, 1)}
                </span>
                <span
                  aria-label={`${weekdayNames[i]}${trained ? ", trained" : isPlanned ? ", planned" : ""}`}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2",
                    trained
                      ? "bg-accent border-accent text-accent-foreground"
                      : isPlanned
                        ? "border-accent/50 border-dashed"
                        : "bg-muted border-transparent",
                  )}
                >
                  {trained && <Dumbbell className="size-4" />}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        aria-label="Quick actions"
        className={cn(
          "grid gap-2",
          quickCount > 1 && "grid-cols-2",
          quickCount > 2 && "sm:grid-cols-3",
        )}
      >
        <LogWeightButton
          units={units}
          className={cn("h-12", quickCount === 3 && "col-span-2 sm:col-span-1")}
        />
        {profile?.trackNutrition && (
          <Link
            href="/nutrition"
            className={buttonVariants({ variant: "outline", className: "h-12" })}
          >
            <Salad /> Log food
          </Link>
        )}
        {profile?.trackRecovery && (
          <Link
            href="/recovery"
            className={buttonVariants({ variant: "outline", className: "h-12" })}
          >
            <HeartPulse /> Check in
          </Link>
        )}
      </section>

      <Link href="/coach" className={buttonVariants({ variant: "outline", className: "h-12" })}>
        <Bot /> Ask the coach
      </Link>

      {insight && (
        <Link href={insight.href}>
          <Card className="hover:bg-muted flex items-start gap-3 transition-colors">
            {freshRecord && fatigue.level !== "deload" ? (
              <Trophy className="text-accent mt-0.5 size-5 shrink-0" />
            ) : (
              <Sparkles className="text-accent mt-0.5 size-5 shrink-0" />
            )}
            <p className="text-sm">{insight.text}</p>
          </Card>
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
