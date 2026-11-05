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
} from "@/modules/analytics/insights";
import { insightData, mainLiftBests } from "@/modules/analytics/insights-queries";
import {
  landmarkRead,
  last28Days,
  neglectedMuscles,
  trainingLoad,
} from "@/modules/analytics/landmarks";
import { strengthRatios } from "@/modules/analytics/ratios";
import {
  factorEffects,
  minSessions,
  performanceByWorkout,
  type PerfSet,
} from "@/modules/analytics/correlations";
import { checkinRange } from "@/modules/recovery/recovery";
import { dailyTotals } from "@/modules/nutrition/nutrition";
import { addDays } from "@/modules/history/schedule";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { bodyweightNow } from "@/modules/goals/goals";

export const metadata: Metadata = { title: "Detailed analysis" };

type CheckinRow = Awaited<ReturnType<typeof checkinRange>>[number];
type FoodRow = Awaited<ReturnType<typeof dailyTotals>>[number];

/** Daily factors set against how strong each session was. */
function whatHelps(sets: PerfSet[], checkins: CheckinRow[], food: FoodRow[]) {
  const c = new Map(checkins.map((x) => [x.day, x]));
  const f = new Map(food.map((x) => [x.day, x]));
  const dayBefore = (day: string) => f.get(addDays(day, -1));
  const score = (n: number | null | undefined) => n ?? null;
  return factorEffects(performanceByWorkout(sets), [
    {
      key: "sleep",
      label: "Sleep",
      high: (v) => `${v} h sleep or more`,
      valueFor: (d) => score(c.get(d)?.sleepHours),
    },
    {
      key: "quality",
      label: "Sleep quality",
      high: (v) => `sleep quality ${v}/5 or better`,
      valueFor: (d) => score(c.get(d)?.sleepQuality),
    },
    {
      key: "energy",
      label: "Energy",
      high: (v) => `energy ${v}/5 or higher`,
      valueFor: (d) => score(c.get(d)?.energy),
    },
    {
      key: "soreness",
      label: "Soreness",
      high: (v) => `soreness ${v}/5 or higher`,
      valueFor: (d) => score(c.get(d)?.soreness),
    },
    {
      key: "stress",
      label: "Stress",
      high: (v) => `stress ${v}/5 or higher`,
      valueFor: (d) => score(c.get(d)?.stress),
    },
    {
      key: "calories",
      label: "Calories the day before",
      high: (v) => `${v.toLocaleString("en")} kcal or more the day before`,
      valueFor: (d) => score(dayBefore(d)?.calories),
    },
    {
      key: "protein",
      label: "Protein the day before",
      high: (v) => `${Math.round(v)} g protein or more the day before`,
      valueFor: (d) => score(dayBefore(d)?.proteinG),
    },
  ]);
}

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
  // Correlations look at the last six months whatever the range.
  const today = localDay(new Date(), tz);
  const halfYear = new Date(Date.parse(`${today}T00:00:00Z`) - 183 * 86400000);
  const since = from < halfYear ? from : halfYear;
  const sinceDay = since.toISOString().slice(0, 10);
  const [{ sets, links }, profile, liftBests, body, checkins, food] = await Promise.all([
    insightData(db, user.id, since),
    getProfile(user.id),
    mainLiftBests(db, user.id),
    bodyweightNow(db, user.id),
    checkinRange(db, user.id, sinceDay, today),
    dailyTotals(db, user.id, sinceDay, today),
  ]);
  const ratios = strengthRatios(liftBests, body.current);
  const units = profile?.unitSystem ?? "metric";
  const i = buildInsights(sets, links, weeks, tz);
  const load = trainingLoad(
    last28Days(
      sets.filter((s) => s.type !== "warmup").map((s) => localDay(s.startedAt, tz)),
      today,
    ),
  );
  const effects = whatHelps(
    sets.map((x) => ({ ...x, day: localDay(x.startedAt, tz) })),
    checkins,
    food,
  );
  const neglected = neglectedMuscles(new Map(i.muscleAvg.map((m) => [m.muscle, m.avg])));

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
  const kg = (v: number) => `${displayWeight(v, units, 1)} ${weightUnitLabel(units)}`;
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

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <CardLabel>Load this week</CardLabel>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{load.acute} sets</p>
          {load.ratio != null && (
            <p className="text-muted-foreground text-xs">
              {load.ratio.toFixed(2)}× your 4-week average of {Math.round(load.chronic)}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            {load.read === "spike"
              ? "A big jump on recent weeks. Sudden spikes are when niggles tend to start, so build up gradually."
              : load.read === "drop"
                ? "Well below your recent average. Fine for a deload or a busy week."
                : load.read === "steady"
                  ? "In line with your recent training."
                  : "Train for a few weeks to compare against."}
          </p>
        </Card>
        <Card>
          <CardLabel>Monotony and strain</CardLabel>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {load.monotony >= 10 ? "10+" : load.monotony.toFixed(1)}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              strain {Math.round(load.strain).toLocaleString("en")}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {load.acute === 0
              ? "No training in the last 7 days."
              : load.monotonous
                ? "Very similar load every day. Mixing hard and easy days, with rest days, helps recovery."
                : "Good mix of harder, easier and rest days over the last 7 days. Monotony under 2 is healthy."}
          </p>
        </Card>
        <Card>
          <CardLabel>Getting little work</CardLabel>
          {neglected.length ? (
            <>
              <p className="mt-1 text-sm font-medium">
                {neglected.map((m) => muscleName.get(m) ?? m).join(", ")}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Under 2 sets a week over {ranges[range].label}. Fine if that&apos;s on purpose;
                otherwise a couple of sets a week keeps them in balance.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              Every major muscle gets at least 2 sets a week. Nicely balanced.
            </p>
          )}
        </Card>
      </div>

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
            Average over {ranges[range].label}, read against rough per-muscle guides: maintenance,
            light, productive, near max and above max. Secondary muscles count as half a set. People
            differ, so watch your own progress too.
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
                const band = landmarkRead(m.muscle, m.avg);
                const l = band.landmarks;
                return (
                  <tr key={m.muscle} className="border-border border-b last:border-0">
                    <td className="py-1.5">{muscleName.get(m.muscle) ?? m.muscle}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {m.avg.toFixed(1)}
                    </td>
                    <td
                      title={
                        l
                          ? `Maintenance under ${l.mev}, productive ${l.mavLow}–${l.mavHigh}, max about ${l.mrv}`
                          : undefined
                      }
                      className={cn(
                        "w-28 py-1.5 pl-3 text-right text-xs",
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

      {ratios.length > 0 && (
        <>
          <h2 className="mt-8 mb-1 text-lg font-semibold">Strength for your body weight</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            {body.current
              ? `Best estimated 1RM in the last 6 months divided by your trend weight of ${kg(body.current)}. Milestones are common gym markers, not standards.`
              : "Log your weight on the Body page to see these as multiples of body weight."}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ratios.map((r) => (
              <Card key={r.name}>
                <Link
                  href={`/exercises/${r.exerciseId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {r.name}
                </Link>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {r.ratio != null ? `${r.ratio.toFixed(2)}×` : kg(r.e1rm)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {r.ratio != null && `${kg(r.e1rm)} est. 1RM`}
                  {r.next != null && r.toNext != null
                    ? ` · ${kg(r.toNext)} to ${r.next}×`
                    : r.ratio != null
                      ? " · past every milestone"
                      : ""}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-8 mb-1 text-lg font-semibold">What goes with your better sessions</h2>
      <p className="text-muted-foreground mb-3 text-sm">
        Each session is scored by how its estimated 1RMs compare with your previous sessions of the
        same exercises, then set against your check-ins and food log over the last 6 months. These
        are patterns in your data, not proof of cause.
      </p>
      <Card className="mb-4">
        {effects.some((e) => "r" in e) ? (
          <>
            <ul className="flex flex-col gap-3 text-sm">
              {effects.flatMap((e) =>
                "r" in e && e.r != null && e.strength !== "no clear"
                  ? [
                      <li key={e.key}>
                        <p>
                          On days with {e.highLabel}, sessions were{" "}
                          <span className="font-semibold">
                            {Math.abs(e.gap!).toFixed(1)}% {e.gap! >= 0 ? "stronger" : "weaker"}
                          </span>{" "}
                          than otherwise.
                        </p>
                        <p className="text-muted-foreground text-xs">
                          A {e.strength} link (r {e.r.toFixed(2)}, {e.n} sessions)
                        </p>
                      </li>,
                    ]
                  : [],
              )}
            </ul>
            {(() => {
              const unclear = effects.filter((e) => "strength" in e && e.strength === "no clear");
              return unclear.length ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  No clear link yet: {unclear.map((e) => e.label.toLowerCase()).join(", ")}.
                </p>
              ) : null;
            })()}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Not enough paired data yet. Log daily check-ins on the{" "}
            <Link href="/recovery" className="text-accent hover:underline">
              Recovery
            </Link>{" "}
            page (sleep, energy, soreness) or your food; once about {minSessions} workouts line up
            with them, you&apos;ll see what goes with your stronger sessions.
          </p>
        )}
      </Card>

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
      <Link href="/progress" className="text-muted-foreground mb-2 inline-block text-sm">
        ← Progress
      </Link>
      <PageHeader title="Detailed analysis" subtitle="Volume, training load and muscle balance" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <InsightsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}
