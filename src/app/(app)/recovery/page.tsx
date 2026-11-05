import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { localDay } from "@/modules/analytics/insights";
import { baselineFrom, loadRatio, readiness } from "@/modules/recovery/readiness";
import { recoveryMap } from "@/modules/recovery/muscle-map";
import { insightData } from "@/modules/analytics/insights-queries";
import { isWorkingSet } from "@/modules/analytics/calc";
import { muscles as muscleList } from "@/db/seed/muscles";
import { cn } from "@/lib/utils";
import { checkinRange, getCheckin, volumeBetween } from "@/modules/recovery/recovery";
import { FatigueCard } from "@/components/recovery/fatigue-card";
import { fatigueFor } from "@/modules/coach/fatigue-queries";
import { CheckinForm } from "./checkin-form";

export const metadata: Metadata = { title: "Recovery" };

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function Recovery() {
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  await connection();
  const now = new Date();
  const today = localDay(now, tz);
  const from = shift(today, -13);
  const baselineFromDay = shift(today, -28);
  const day = (n: number) => new Date(now.getTime() - n * 86400000);

  const [checkin, month, last7, last28, profile, fatigue, recent] = await Promise.all([
    getCheckin(db, user.id, today),
    checkinRange(db, user.id, baselineFromDay, today),
    volumeBetween(db, user.id, day(7), now),
    volumeBetween(db, user.id, day(28), now),
    getProfile(user.id),
    fatigueFor(db, user.id, tz, now),
    insightData(db, user.id, day(5)),
  ]);
  const history = month.filter((c) => c.day >= from);
  const ratio = loadRatio(last7, last28);
  const r = readiness(checkin, ratio, baselineFrom(month.filter((c) => c.day < today)));
  const muscleOf = new Map<string, typeof recent.links>();
  for (const l of recent.links)
    muscleOf.set(l.exerciseId, [...(muscleOf.get(l.exerciseId) ?? []), l]);
  const map = recoveryMap(
    recent.sets.filter(isWorkingSet).flatMap((s) =>
      (muscleOf.get(s.exerciseId) ?? []).map((l) => ({
        workoutId: s.workoutId,
        at: s.finishedAt ?? s.startedAt,
        muscle: l.muscle,
        role: l.role,
      })),
    ),
    now,
    checkin?.soreMuscles ?? [],
  );
  const muscleName = new Map<string, string>(muscleList.map((m) => [m.slug, m.name]));
  const units = profile?.unitSystem ?? "metric";
  const days = Array.from({ length: 14 }, (_, i) => shift(from, i));
  const byDay = new Map(history.map((h) => [h.day, h]));
  const label = (d: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const avgSleep = avg(history.map((h) => h.sleepHours));
  const avgSteps = avg(history.map((h) => h.steps));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardLabel>Readiness today</CardLabel>
          {r ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="flex items-baseline gap-3">
                <span className="text-5xl font-semibold">{r.score}</span>
                <span className="text-muted-foreground text-sm">
                  out of 100 ·{" "}
                  {r.level === "high" ? "Ready" : r.level === "moderate" ? "Okay" : "Take it easy"}
                </span>
              </p>
              <p className="text-sm">{r.advice}</p>
              {r.factors.length > 0 && (
                <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {r.factors.map((f) => (
                    <li key={f.label}>
                      {f.effect === "helps" ? "▲" : "▼"} {f.label}{" "}
                      {f.effect === "helps" ? "helping" : "holding you back"}
                    </li>
                  ))}
                </ul>
              )}
              {r.inputs < 3 && (
                <p className="text-muted-foreground text-xs">
                  Based on only {r.inputs} {r.inputs === 1 ? "thing" : "things"}. Fill in more of
                  the check-in for a better read.
                </p>
              )}
              {ratio != null && (
                <p className="text-muted-foreground text-xs">
                  Training load: last 7 days are {Math.round(ratio * 100)}% of your usual week.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground mt-2 text-sm">
              Fill in today&apos;s check-in to see how ready you are to train.
            </p>
          )}
        </Card>

        <FatigueCard f={fatigue} />

        <Card>
          <CardLabel>Muscle recovery</CardLabel>
          <p className="text-muted-foreground mb-3 text-xs">
            From your last session for each muscle: about two days to recover, longer for big
            muscles and long sessions. Muscles you marked sore today show as sore.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {map.map((m) => (
              <li
                key={m.muscle}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-sm",
                  m.status === "ready" && "border-accent/40",
                  m.status === "recovering" && "border-dashed",
                  m.status === "sore" && "border-amber-500/60",
                )}
              >
                <span className="block font-medium">{muscleName.get(m.muscle) ?? m.muscle}</span>
                <span
                  className={cn(
                    "text-xs",
                    m.status === "ready" && "text-accent",
                    m.status === "recovering" && "text-muted-foreground",
                    m.status === "sore" && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {m.status === "ready"
                    ? "✓ Ready"
                    : m.status === "sore"
                      ? "Sore today"
                      : `About ${m.hoursLeft} h to go`}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardLabel>Sleep, last 14 days</CardLabel>
          <p className="text-muted-foreground mb-3 text-xs">
            {avgSleep != null
              ? `Average ${avgSleep.toFixed(1)} hours a night`
              : "No sleep logged yet"}
          </p>
          <BarChart
            name="Hours of sleep per night, last 14 days"
            kind="count"
            units={units}
            height={150}
            bars={days.map((d) => ({
              key: d,
              label: label(d),
              value: byDay.get(d)?.sleepHours ?? 0,
              detail: byDay.get(d)?.sleepHours != null ? "hours" : "not logged",
            }))}
          />
        </Card>

        <Card>
          <CardLabel>Steps, last 14 days</CardLabel>
          <p className="text-muted-foreground mb-3 text-xs">
            {avgSteps != null
              ? `Average ${Math.round(avgSteps).toLocaleString("en")} a day`
              : "No steps logged yet"}
          </p>
          <BarChart
            name="Steps per day, last 14 days"
            kind="count"
            units={units}
            height={150}
            bars={days.map((d) => ({
              key: d,
              label: label(d),
              value: byDay.get(d)?.steps ?? 0,
              detail: byDay.get(d)?.steps != null ? "steps" : "not logged",
            }))}
          />
        </Card>
      </div>

      <Card className="order-first self-start lg:order-none">
        <CardLabel>Today&apos;s check-in</CardLabel>
        <div className="mt-3">
          <CheckinForm
            day={today}
            initial={
              checkin && {
                sleepHours: checkin.sleepHours,
                sleepQuality: checkin.sleepQuality,
                energy: checkin.energy,
                soreness: checkin.soreness,
                stress: checkin.stress,
                steps: checkin.steps,
                restingHr: checkin.restingHr,
                hrvMs: checkin.hrvMs,
                soreMuscles: checkin.soreMuscles,
              }
            }
          />
        </div>
      </Card>
    </div>
  );
}

export default function RecoveryPage() {
  return (
    <>
      <PageHeader title="Recovery" subtitle="Daily check-ins for sleep, energy and soreness" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Recovery />
      </Suspense>
    </>
  );
}
