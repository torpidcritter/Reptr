import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { BodyTabs } from "@/components/layout/body-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { localDay } from "@/modules/analytics/insights";
import { loadRatio, readiness } from "@/modules/recovery/readiness";
import { checkinRange, getCheckin, volumeBetween } from "@/modules/recovery/recovery";
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
  const day = (n: number) => new Date(now.getTime() - n * 86400000);

  const [checkin, history, last7, last28, profile] = await Promise.all([
    getCheckin(db, user.id, today),
    checkinRange(db, user.id, from, today),
    volumeBetween(db, user.id, day(7), now),
    volumeBetween(db, user.id, day(28), now),
    getProfile(user.id),
  ]);
  const ratio = loadRatio(last7, last28);
  const r = readiness(checkin, ratio);
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
      <PageHeader title="Body" subtitle="Weight, measurements, food and recovery" />
      <BodyTabs current="/recovery" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Recovery />
      </Suspense>
    </>
  );
}
