import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricChart } from "@/components/charts/metric-chart";
import { LogWeightButton } from "@/components/body/log-weight";
import { WeightHistory } from "@/components/body/weight-history";
import { EmptyState } from "@/components/ui/empty-state";
import { Scale } from "lucide-react";
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
  weightHistory,
} from "@/modules/body/body";
import { changeOver, dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
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
  const [profile, weights, history, summary, photos] = await Promise.all([
    getProfile(user.id),
    metricSeries(db, user.id, "weight"),
    weightHistory(db, user.id),
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
  const others = metricTypes.filter((t) => t !== "weight" && summary.has(t));
  const latest = history[0];
  const previous = history[1];
  const changes = [
    ["Last 7 days", changeOver(daily, 7)],
    ["Last 30 days", changeOver(daily, 30)],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {latest ? (
        <section aria-labelledby="weight-title" className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="weight-title" className="text-muted-foreground text-sm font-medium">
                Body weight
              </h2>
              <p className="text-3xl font-semibold tabular-nums">
                {fmtValue("weight", latest.weightKg, units)}
              </p>
              <p className="text-muted-foreground text-sm">
                {previous
                  ? `Previous ${fmtValue("weight", previous.weightKg, units)}`
                  : "Your first weigh-in"}
              </p>
            </div>
            <LogWeightButton units={units} variant="primary" />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {changes.map(([label, d]) => (
              <div key={label} className="bg-muted rounded-xl px-3 py-2">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="font-semibold tabular-nums">
                  {d == null ? "Not enough yet" : signed("weight", d, units)}
                </dd>
              </div>
            ))}
            <div className="bg-muted rounded-xl px-3 py-2">
              <dt className="text-muted-foreground text-xs">Trend</dt>
              <dd className="font-semibold tabular-nums">
                {rate == null
                  ? "Not enough yet"
                  : rate === 0
                    ? "Steady"
                    : `${rate > 0 ? "+" : "−"}${displayWeight(Math.abs(rate), units, 2)} ${weightUnitLabel(units)}/wk`}
              </dd>
            </div>
          </dl>
          {daily.length >= 3 ? (
            <Card>
              <MetricChart
                kind="weight"
                units={units}
                name="Body weight trend"
                points={trend.map((r) => ({ x: ts(r.day), y: r.value }))}
                dots={daily.map((r) => ({ x: ts(r.day), y: r.value }))}
                legend={{ line: "Trend", dots: "Weigh-in" }}
              />
              <p className="text-muted-foreground mt-3 text-xs">
                Daily weight moves with water, salt and food. The trend line smooths that out.
              </p>
            </Card>
          ) : (
            <p className="text-muted-foreground text-sm">
              Log a few more mornings to see your trend line.
            </p>
          )}
          <details className="group">
            <summary className="text-accent cursor-pointer text-sm font-medium">
              All weigh-ins ({history.length})
            </summary>
            <div className="mt-3">
              <WeightHistory entries={history} units={units} />
            </div>
          </details>
        </section>
      ) : (
        <EmptyState
          icon={Scale}
          title="Start tracking your body weight"
          body="Weigh in a few mornings a week and Reptr shows your trend, not the daily noise."
          action={<LogWeightButton units={units} variant="primary" />}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
              Add body fat or tape measurements below. Waist is the most useful one to track.
            </p>
          )}
          <details className="mt-3">
            <summary className="text-accent cursor-pointer text-sm font-medium">
              Add measurements
            </summary>
            <div className="mt-3">
              <EntryForm units={units} />
            </div>
          </details>
        </Card>

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
    </div>
  );
}

export default function PhysiquePage() {
  return (
    <>
      <PageHeader title="Body" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Body />
      </Suspense>
    </>
  );
}
