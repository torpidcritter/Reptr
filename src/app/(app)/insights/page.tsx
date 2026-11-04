import { LineChart as LineIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { MetricChart } from "@/components/charts/metric-chart";
import { MuscleHeatmap } from "@/components/charts/muscle-heatmap";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { muscles as muscleList } from "@/db/seed/muscles";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildInsights,
  lastWeeks,
  localDay,
  parseRange,
  type RangeKey,
  ranges,
  volumeBand,
} from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";

export const metadata: Metadata = { title: "Insights" };

const muscleName = new Map<string, string>(muscleList.map((m) => [m.slug, m.name]));

function Delta({ now, before, unit = "" }: { now: number; before: number; unit?: string }) {
  if (!before) return <span className="text-muted-foreground text-xs">No earlier data</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className="text-muted-foreground text-xs">
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {pct > 0 ? "+" : ""}
      {pct}%{unit} vs previous period
    </span>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <Card>
      <CardLabel>{label}</CardLabel>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {delta}
    </Card>
  );
}

function RangeTabs({ current }: { current: RangeKey }) {
  return (
    <nav className="bg-muted mb-6 inline-flex rounded-lg p-1" aria-label="Time range">
      {(Object.keys(ranges) as RangeKey[]).map((k) => (
        <Link
          key={k}
          href={`/insights?range=${k}`}
          aria-current={k === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            k === current
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {ranges[k].label}
        </Link>
      ))}
    </nav>
  );
}

async function InsightsBody({ searchParams }: Pick<PageProps<"/insights">, "searchParams">) {
  const [sp, user, tz] = await Promise.all([searchParams, requireUser(), getTimeZone()]);
  const range = parseRange(typeof sp.range === "string" ? sp.range : undefined);
  await connection(); // "this week" depends on the request time
  const weeks = lastWeeks(localDay(new Date(), tz), ranges[range].weeks);
  // Twice the range (for the comparison) plus a day of slack for time zones.
  const from = new Date(`${weeks[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 7 * weeks.length - 1);
  const [{ sets, links }, profile] = await Promise.all([
    insightData(db, user.id, from),
    getProfile(user.id),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const i = buildInsights(sets, links, weeks, tz);

  if (!i.totals.workouts && !i.previous.workouts) {
    return (
      <>
        <RangeTabs current={range} />
        <EmptyState
          icon={LineIcon}
          title="Nothing to analyse yet"
          body="Charts appear here once you have logged a few workouts."
        />
      </>
    );
  }

  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const weekLabel = (w: string) => day.format(new Date(`${w}T00:00:00Z`));
  const perWeek = (n: number) => (n / weeks.length).toFixed(1).replace(/\.0$/, "");

  return (
    <>
      <RangeTabs current={range} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Workouts"
          value={String(i.totals.workouts)}
          delta={<Delta now={i.totals.workouts} before={i.previous.workouts} />}
        />
        <Stat
          label="Per week"
          value={perWeek(i.totals.workouts)}
          delta={<span className="text-muted-foreground text-xs">workouts on average</span>}
        />
        <Stat
          label="Volume"
          value={formatVolume(i.totals.volume, units)}
          delta={<Delta now={i.totals.volume} before={i.previous.volume} />}
        />
        <Stat
          label="Working sets"
          value={i.totals.sets.toLocaleString("en")}
          delta={<Delta now={i.totals.sets} before={i.previous.sets} />}
        />
      </div>

      <Card className="mb-4">
        <CardLabel>Weekly volume</CardLabel>
        <p className="text-muted-foreground mb-3 text-xs">Weight × reps on working sets</p>
        <BarChart
          name="Weekly volume"
          kind="volume"
          units={units}
          bars={i.weekly.map((w) => ({
            key: w.week,
            label: weekLabel(w.week),
            value: w.volume,
            detail: `${w.workouts} ${w.workouts === 1 ? "workout" : "workouts"}, ${w.sets} sets`,
          }))}
        />
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardLabel>Muscle heatmap</CardLabel>
          <div className="mt-2">
            <MuscleHeatmap
              weeks={weeks}
              rows={i.muscleAvg.map((m) => ({
                muscle: m.muscle,
                name: muscleName.get(m.muscle) ?? m.muscle,
                perWeek: m.perWeek,
              }))}
            />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardLabel>Sets per muscle per week</CardLabel>
          <p className="text-muted-foreground mt-1 mb-3 text-xs">
            Average over {ranges[range].label}. Most people grow well on 10–20 hard sets a week.
            Secondary muscles count as half a set.
          </p>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Muscle</th>
                <th>Sets per week</th>
                <th>Read</th>
              </tr>
            </thead>
            <tbody>
              {i.muscleAvg.map((m) => {
                const band = volumeBand(m.avg);
                return (
                  <tr key={m.muscle} className="border-border border-b last:border-0">
                    <td className="py-1.5">{muscleName.get(m.muscle) ?? m.muscle}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {m.avg.toFixed(1)}
                    </td>
                    <td
                      className={cn(
                        "w-24 py-1.5 pl-3 text-right text-xs",
                        band.tone === "ok" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {band.tone === "ok" ? "✓ " : band.tone === "high" ? "▲ " : "▽ "}
                      {band.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {i.topLifts.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-semibold">Main lifts, estimated 1RM</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {i.topLifts.map((l) => (
              <Card key={l.exerciseId}>
                <Link href={`/exercises/${l.exerciseId}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
                <div className="mt-2">
                  <MetricChart
                    points={l.points}
                    kind="weight"
                    units={units}
                    name={`${l.name} estimated 1RM`}
                    height={140}
                  />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function InsightsPage({ searchParams }: PageProps<"/insights">) {
  return (
    <>
      <PageHeader title="Insights" subtitle="Strength, volume and muscle analytics" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <InsightsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}
