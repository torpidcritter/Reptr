import { History } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDuration, formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { milestones } from "@/modules/achievements/milestones";
import { localDay, weekOf } from "@/modules/analytics/insights";
import { recentRecords } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine } from "@/modules/body/trend";
import { firstPerformances, listWorkoutHistory } from "@/modules/history/history";
import { monthlyTimeline } from "@/modules/history/timeline";

export const metadata: Metadata = { title: "Timeline" };

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

async function Timeline() {
  const user = await requireUser();
  const [profile, tz] = await Promise.all([getProfile(user.id), getTimeZone()]);
  const units = profile?.unitSystem ?? "metric";
  const [history, records, firsts, weightRows] = await Promise.all([
    listWorkoutHistory(db, user.id, { limit: 5000 }),
    recentRecords(db, user.id, 5000),
    firstPerformances(db, user.id),
    metricSeries(db, user.id, "weight"),
  ]);
  if (!history.length) {
    return (
      <EmptyState
        icon={History}
        title="Your story starts with a workout"
        body="Each month you train shows up here: what you did, what was new and what changed."
      />
    );
  }
  const day = (d: Date) => localDay(d, tz);
  const workouts = history.toReversed().map((w) => ({
    day: day(w.startedAt),
    volumeKg: w.volumeKg,
    minutes: w.finishedAt ? (w.finishedAt.getTime() - w.startedAt.getTime()) / 60000 : null,
  }));
  const months = monthlyTimeline({
    workouts,
    records: records.map((r) => ({ day: day(r.achievedAt) })),
    firsts: firsts.map((f) => ({ day: day(f.firstAt), name: f.name })),
    weights: trendLine(dailyReadings(weightRows.map((r) => ({ day: r.day, value: r.value })))),
    milestones: milestones(workouts, weekOf),
  });
  const w = (kg: number) => `${displayWeight(kg, units, 1)} ${weightUnitLabel(units)}`;

  return (
    <ol className="border-border ml-2 flex flex-col gap-4 border-l pl-5">
      {months.map((m) => {
        const change = m.weight ? m.weight.end - m.weight.start : 0;
        const firstsShown = m.firsts.slice(0, 6);
        return (
          <li key={m.month} className="relative">
            <span
              aria-hidden
              className="bg-accent ring-background absolute top-5 -left-[1.6rem] size-2.5 rounded-full ring-4"
            />
            <Card>
              <h2 className="font-semibold">{monthName(m.month)}</h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {m.workouts} workout{m.workouts === 1 ? "" : "s"}
                {m.minutes > 0 && ` · ${formatDuration(m.minutes * 60000)}`}
                {m.volumeKg > 0 && ` · ${formatVolume(m.volumeKg, units)}`}
                {m.records > 0 && ` · ${m.records} record${m.records === 1 ? "" : "s"}`}
              </p>
              {m.milestones.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {m.milestones.map((t) => (
                    <li
                      key={t}
                      className="bg-accent-soft text-accent rounded-full px-2.5 py-0.5 text-xs font-medium"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {m.weight && Math.abs(change) >= 0.1 && (
                <p className="mt-2 text-sm">
                  Body weight {w(m.weight.start)} → {w(m.weight.end)}{" "}
                  <span className="text-muted-foreground">
                    ({change > 0 ? "+" : "−"}
                    {w(Math.abs(change))})
                  </span>
                </p>
              )}
              {firstsShown.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">First time: </span>
                  {firstsShown.join(", ")}
                  {m.firsts.length > firstsShown.length &&
                    ` and ${m.firsts.length - firstsShown.length} more`}
                </p>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

export default function TimelinePage() {
  return (
    <>
      <PageHeader title="Timeline" subtitle="Your training, month by month" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Timeline />
      </Suspense>
    </>
  );
}
