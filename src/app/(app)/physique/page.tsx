import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricChart } from "@/components/charts/metric-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { signedUrls, storageEnabled } from "@/lib/supabase/storage";
import { cmToIn, displayWeight, type UnitSystem, weightUnitLabel } from "@/lib/units";
import {
  listPhotos,
  measurementSummary,
  metricLabels,
  type MetricType,
  metricSeries,
  metricTypes,
  photoBucket,
} from "@/modules/body/body";
import { dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
import { EntryForm } from "./entry-form";
import { Photos } from "./photos";

export const metadata: Metadata = { title: "Physique" };

const ts = (day: string) => Date.parse(`${day}T12:00:00Z`);

function fmtValue(type: MetricType, v: number, units: UnitSystem) {
  if (type === "weight") return `${displayWeight(v, units, 1)} ${weightUnitLabel(units)}`;
  if (type === "body_fat") return `${Math.round(v * 10) / 10}%`;
  return units === "metric"
    ? `${Math.round(v * 10) / 10} cm`
    : `${Math.round(cmToIn(v) * 10) / 10} in`;
}

function signed(type: MetricType, d: number, units: UnitSystem) {
  if (Math.abs(d) < 0.05) return "No change";
  if (type === "body_fat") return `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 10) / 10} pts`;
  return `${d > 0 ? "+" : "−"}${fmtValue(type, Math.abs(d), units)}`;
}

async function Body() {
  const user = await requireUser();
  const [profile, weights, summary, photos] = await Promise.all([
    getProfile(user.id),
    metricSeries(db, user.id, "weight"),
    measurementSummary(db, user.id),
    listPhotos(db, user.id),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const daily = dailyReadings(weights);
  const trend = trendLine(daily);
  const rate = weeklyRate(trend);
  const urls = await signedUrls(
    photoBucket,
    photos.map((p) => p.storagePath),
  );
  const latestTrend = trend.at(-1);
  const others = metricTypes.filter((t) => t !== "weight" && summary.has(t));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardLabel>Check in</CardLabel>
        <div className="mt-3">
          <EntryForm units={units} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardLabel>Body weight</CardLabel>
          {daily.length ? (
            <>
              <div className="mt-1 mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-2xl font-semibold">
                  {fmtValue("weight", latestTrend!.value, units)}
                </span>
                <span className="text-muted-foreground text-sm">
                  trend weight
                  {rate != null &&
                    ` · ${rate === 0 ? "steady" : `${rate > 0 ? "+" : "−"}${displayWeight(Math.abs(rate), units, 2)} ${weightUnitLabel(units)} a week`} over the last 4 weeks`}
                </span>
              </div>
              <MetricChart
                kind="weight"
                units={units}
                name="Body weight trend"
                points={trend.map((r) => ({ x: ts(r.day), y: r.value }))}
                dots={daily.map((r) => ({ x: ts(r.day), y: r.value }))}
                legend={{ line: "Trend", dots: "Weigh-in" }}
              />
              <p className="text-muted-foreground mt-3 text-xs">
                Daily weight moves with water, salt and food. The trend line smooths that out, so
                judge progress by it rather than any single morning.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              Log your weight a few mornings a week to see a trend.
            </p>
          )}
        </Card>

        <Card>
          <CardLabel>Measurements</CardLabel>
          {others.length ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="pb-1 text-left font-normal">Measure</th>
                  <th className="pb-1 text-right font-normal">Latest</th>
                  <th className="pb-1 text-right font-normal">Since first</th>
                </tr>
              </thead>
              <tbody>
                {others.map((t) => {
                  const s = summary.get(t)!;
                  return (
                    <tr key={t} className="border-border border-t">
                      <td className="py-1.5">{metricLabels[t]}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">
                        {fmtValue(t, s.latest, units)}
                      </td>
                      <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                        {s.count > 1 ? signed(t, s.latest - s.first, units) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              Add body fat or tape measurements in a check-in. Waist is the most useful one to
              track.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardLabel>Progress photos</CardLabel>
        <div className="mt-3">
          <Photos
            userId={user.id}
            enabled={storageEnabled()}
            photos={photos.map((p) => ({
              id: p.id,
              pose: p.pose,
              takenOn: p.takenOn,
              url: urls.get(p.storagePath) ?? null,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}

export default function PhysiquePage() {
  return (
    <>
      <PageHeader title="Physique" subtitle="Body weight, measurements and photos" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Body />
      </Suspense>
    </>
  );
}
