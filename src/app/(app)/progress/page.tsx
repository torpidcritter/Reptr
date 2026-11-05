import { ChevronRight, Dumbbell, LineChart, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogWeightButton } from "@/components/body/log-weight";
import { MetricChart } from "@/components/charts/metric-chart";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { muscles as muscleList } from "@/db/seed/muscles";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatDuration } from "@/lib/format";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import { buildInsights, lastWeeks, localDay } from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";
import {
  consistency,
  splitSentence,
  strengthChange,
  strengthSentence,
} from "@/modules/analytics/progress";
import { bestLifts } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { changeOver, dailyReadings } from "@/modules/body/trend";
import { weekStreak } from "@/modules/dashboard/dashboard";
import { listWorkoutHistory } from "@/modules/history/history";

export const metadata: Metadata = { title: "Progress" };

const muscleName = new Map<string, string>(muscleList.map((m) => [m.slug, m.name]));
const WEEKS = 12;

function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        {link && (
          <Link href={link.href} className="text-accent text-sm font-medium">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function ProgressView({ searchParams }: Pick<PageProps<"/progress">, "searchParams">) {
  const [sp, user, tz] = await Promise.all([searchParams, requireUser(), getTimeZone()]);
  await connection(); // the weeks depend on the request time
  const weeks = lastWeeks(localDay(new Date(), tz), WEEKS);
  const from = new Date(`${weeks[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const [{ sets, links }, profile, records, weights, recent] = await Promise.all([
    insightData(db, user.id, from),
    getProfile(user.id),
    bestLifts(db, user.id, 5),
    metricSeries(db, user.id, "weight"),
    listWorkoutHistory(db, user.id, { limit: 3 }),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const kg = (v: number, d = 1) => `${displayWeight(v, units, d)} ${weightUnitLabel(units)}`;
  const i = buildInsights(sets, links, weeks, tz);

  if (recent.length === 0 && weights.length === 0)
    return (
      <EmptyState
        icon={LineChart}
        title="Your progress will show here"
        body="Finish a workout or log your weight, and Reptr starts tracking your strength, consistency and body weight."
        action={
          <>
            <Link href="/workout" className={buttonVariants()}>
              Start workout
            </Link>
            <LogWeightButton units={units} />
          </>
        }
      />
    );

  const lift = i.topLifts.find((l) => l.exerciseId === sp.lift) ?? i.topLifts[0];
  const change = lift && strengthChange(lift.points);
  const steady = consistency(i.weekly.map((w) => w.workouts));
  const streak = weekStreak(i.weekly.map((w) => w.workouts));
  const daily = dailyReadings(weights);
  const month = changeOver(daily, 30);
  const split = i.muscleAvg
    .map((m) => ({ name: muscleName.get(m.muscle) ?? m.muscle, avg: m.avg }))
    .filter((m) => m.avg > 0);
  const maxAvg = Math.max(...split.map((m) => m.avg), 1);
  const splitText = splitSentence(split);

  return (
    <div className="flex flex-col gap-8">
      <Section title="Strength" link={{ href: "/achievements", label: "All records" }}>
        {lift && change ? (
          <>
            {i.topLifts.length > 1 && (
              <nav aria-label="Pick a lift" className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
                {i.topLifts.map((l) => (
                  <Link
                    key={l.exerciseId}
                    href={`/progress?lift=${l.exerciseId}`}
                    scroll={false}
                    aria-current={l.exerciseId === lift.exerciseId ? "true" : undefined}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                      l.exerciseId === lift.exerciseId
                        ? "bg-foreground text-background border-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {l.name}
                  </Link>
                ))}
              </nav>
            )}
            <Card>
              <p className="text-sm">{strengthSentence(lift.name, change)}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {kg(change.last)}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  estimated max, from {kg(change.first)}
                </span>
              </p>
              <div className="mt-3">
                <MetricChart
                  points={lift.points}
                  kind="weight"
                  units={units}
                  name={`${lift.name} estimated max`}
                  height={160}
                />
              </div>
            </Card>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Log the same lift in two workouts and its strength trend shows here.
          </p>
        )}
        {records.length > 0 && (
          <ul className="divide-y rounded-xl border" aria-label="Best lifts">
            {records.map((r) => (
              <li key={r.exerciseId}>
                <Link
                  href={`/exercises/${r.exerciseId}`}
                  className="hover:bg-muted flex items-center gap-3 px-4 py-2.5"
                >
                  <Trophy className="text-accent size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.exercise}</span>
                  <span className="text-sm font-semibold tabular-nums">{kg(r.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Body weight" link={{ href: "/physique", label: "Details" }}>
        {daily.length ? (
          <Card className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{kg(daily.at(-1)!.value)}</p>
              <p className="text-muted-foreground text-sm">
                {month == null
                  ? "Log for a month to see how it's changing."
                  : Math.abs(month) < 0.1
                    ? "About the same as a month ago."
                    : `${month > 0 ? "Up" : "Down"} ${kg(Math.abs(month))} in the last 30 days.`}
              </p>
            </div>
            <LogWeightButton units={units} />
          </Card>
        ) : (
          <Card className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">Start tracking your body weight.</p>
            <LogWeightButton units={units} variant="primary" />
          </Card>
        )}
      </Section>

      <Section title="Consistency" link={{ href: "/plan", label: "Calendar" }}>
        {steady ? (
          <Card>
            <p className="text-sm">
              {steady.perWeek} workout{steady.perWeek === 1 ? "" : "s"} a week on average
              {streak > 1 ? `, and ${streak} weeks in a row with training.` : "."}
            </p>
            <div
              className="mt-3 flex h-16 items-end gap-1"
              role="img"
              aria-label={`Workouts per week, last ${WEEKS} weeks: ${i.weekly.map((w) => w.workouts).join(", ")}`}
            >
              {i.weekly.map((w) => (
                <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn("w-full rounded-sm", w.workouts ? "bg-accent" : "bg-muted")}
                    style={{ height: `${Math.max(w.workouts, 0.15) * 14}px` }}
                  />
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Workouts per week, last {WEEKS} weeks
            </p>
          </Card>
        ) : (
          <p className="text-muted-foreground text-sm">No workouts in the last {WEEKS} weeks.</p>
        )}
      </Section>

      {split.length > 0 && (
        <Section title="Muscles trained">
          <Card>
            {splitText && <p className="mb-3 text-sm">{splitText}</p>}
            <ul className="flex flex-col gap-1.5" aria-label="Sets per week by muscle">
              {split.slice(0, 8).map((m) => (
                <li
                  key={m.name}
                  className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="bg-muted h-2 rounded-full">
                    <span
                      className="bg-accent block h-2 rounded-full"
                      style={{ width: `${(m.avg / maxAvg) * 100}%` }}
                    />
                  </span>
                  <span className="text-muted-foreground text-right text-xs tabular-nums">
                    {Math.round(m.avg * 10) / 10}/wk
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              Hard sets a week, last {WEEKS} weeks
            </p>
          </Card>
        </Section>
      )}

      <Section title="Recent workouts" link={{ href: "/history", label: "All workouts" }}>
        {recent.length ? (
          <ul className="divide-y rounded-xl border">
            {recent.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/history/${w.id}`}
                  className="hover:bg-muted flex items-center gap-3 px-4 py-3"
                >
                  <Dumbbell className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(w.startedAt, tz)}
                      {w.finishedAt &&
                        ` · ${formatDuration(w.finishedAt.getTime() - w.startedAt.getTime())}`}
                      {` · ${w.setCount} sets`}
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground size-4" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Completed workouts will appear here.</p>
        )}
      </Section>

      <Link href="/insights">
        <Card className="hover:bg-muted flex items-center gap-3 transition-colors">
          <LineChart className="text-muted-foreground size-5" />
          <div className="flex-1">
            <p className="font-medium">Detailed analysis</p>
            <p className="text-muted-foreground text-sm">
              Volume, training load, muscle balance and more, for experienced lifters
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-4" />
        </Card>
      </Link>
    </div>
  );
}

export default function ProgressPage({ searchParams }: PageProps<"/progress">) {
  return (
    <>
      <PageHeader title="Progress" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading your progress…</p>}>
        <ProgressView searchParams={searchParams} />
      </Suspense>
    </>
  );
}
