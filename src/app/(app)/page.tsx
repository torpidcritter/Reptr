import { Dumbbell, Flame, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatRecord, formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { recordLabels } from "@/modules/analytics/calc";
import { buildInsights, lastWeeks, localDay } from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";
import { recentRecords } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
import { nextRoutine, weekStreak } from "@/modules/dashboard/dashboard";

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full">
      <CardLabel>{label}</CardLabel>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="hover:[&>div]:border-accent/40 block">
      {body}
    </Link>
  ) : (
    body
  );
}

async function Dashboard() {
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  await connection(); // "this week" depends on the request time
  const weeks = lastWeeks(localDay(new Date(), tz), 8);
  const from = new Date(`${weeks[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 7 * weeks.length - 1);
  const since = new Date(from);
  since.setUTCDate(since.getUTCDate() - 7); // ~ 17 weeks of weigh-ins

  const [profile, next, data, weights, prs] = await Promise.all([
    getProfile(user.id),
    nextRoutine(db, user.id),
    insightData(db, user.id, from),
    metricSeries(db, user.id, "weight", since),
    recentRecords(db, user.id, 5),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const i = buildInsights(data.sets, data.links, weeks, tz);
  const thisWeek = i.weekly.at(-1)!;
  const lastWeek = i.weekly.at(-2)!;
  const target = profile?.trainingDaysPerWeek;
  const streak = weekStreak(i.weekly.map((w) => w.workouts));
  const trend = trendLine(dailyReadings(weights));
  const rate = weeklyRate(trend);
  const kg = (v: number, d = 1) => `${displayWeight(v, units, d)} ${weightUnitLabel(units)}`;

  return (
    <>
      <Card className="mb-4 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-accent-soft flex size-12 shrink-0 items-center justify-center rounded-xl">
            <Dumbbell className="text-accent size-6" />
          </div>
          <div>
            <CardLabel>{next ? "Up next" : "Today's workout"}</CardLabel>
            <p className="mt-0.5 text-lg font-semibold">{next ? next.name : "No routines yet"}</p>
            <p className="text-muted-foreground text-sm">
              {next
                ? next.lastDone
                  ? `Last done ${formatDate(next.lastDone, tz)}`
                  : "Not done yet"
                : "Start an empty workout, or build a routine to plan your week."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {next && (
            <Link href="/workout" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Pick another
            </Link>
          )}
          <Link
            href={next ? `/workout?routine=${next.id}` : "/workout"}
            className={buttonVariants({ size: "lg" })}
          >
            <Play /> Start {next ? next.name : "workout"}
          </Link>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="This week"
          value={target ? `${thisWeek.workouts} / ${target}` : String(thisWeek.workouts)}
          hint={target ? "workouts vs your target" : "workouts so far"}
          href="/history"
        />
        <Stat
          label="Streak"
          value={`${streak} ${streak === 1 ? "week" : "weeks"}`}
          hint="in a row with a workout"
        />
        <Stat
          label="Volume this week"
          value={thisWeek.volume ? formatVolume(thisWeek.volume, units) : "—"}
          hint={
            lastWeek.volume ? `${formatVolume(lastWeek.volume, units)} last week` : "weight × reps"
          }
          href="/insights"
        />
        <Stat
          label="Body weight"
          value={trend.length ? kg(trend.at(-1)!.value) : "—"}
          hint={
            rate != null
              ? `trend, ${rate === 0 ? "steady" : `${rate > 0 ? "+" : "−"}${kg(Math.abs(rate), 2)} a week`}`
              : trend.length
                ? "trend weight"
                : "log a weigh-in"
          }
          href="/physique"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardLabel>Weekly volume</CardLabel>
          <div className="mt-3">
            <BarChart
              name="Weekly volume, last 8 weeks"
              kind="volume"
              units={units}
              height={160}
              bars={i.weekly.map((w) => ({
                key: w.week,
                label: new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${w.week}T00:00:00Z`)),
                value: w.volume,
                detail: `${w.workouts} ${w.workouts === 1 ? "workout" : "workouts"}`,
              }))}
            />
          </div>
        </Card>
        <Card>
          <CardLabel>Recent records</CardLabel>
          {prs.length ? (
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              {prs.map((r) => (
                <li key={r.id} className="flex items-start gap-2">
                  <Trophy className="text-accent mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/exercises/${r.exerciseId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {r.exercise}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {recordLabels[r.type]} · {formatDate(r.achievedAt, tz)}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatRecord(r.type, r.value, units)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
              <Flame className="size-4" /> Finish a workout to start setting records.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

export default function Home() {
  return (
    <>
      <PageHeader title="Today" subtitle="Your training at a glance" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </>
  );
}
