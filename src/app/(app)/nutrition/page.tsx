import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BodyTabs } from "@/components/layout/body-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { localDay } from "@/modules/analytics/insights";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine } from "@/modules/body/trend";
import { dayLog, getTargets, recentFoods } from "@/modules/nutrition/nutrition";
import { suggestTargets } from "@/modules/nutrition/targets";
import { FoodLog } from "./food-log";
import { TargetsForm } from "./targets-form";

export const metadata: Metadata = { title: "Nutrition" };

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A target meter: the fill shows progress; going over is said in words, not colour alone. */
function Meter({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
}) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target != null && value > target * 1.05;
  const fmt = (n: number) => Math.round(n).toLocaleString("en");
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{fmt(value)}</span>
          <span className="text-muted-foreground">
            {target ? ` / ${fmt(target)} ${unit}` : ` ${unit}`}
          </span>
        </span>
      </div>
      <div className="bg-accent-soft h-2 rounded-full" role="presentation">
        <div className="bg-accent h-2 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted-foreground mt-1 h-4 text-xs">
        {target
          ? over
            ? `${fmt(value - target)} ${unit} over`
            : value >= target * 0.95
              ? "On target"
              : `${fmt(target - value)} ${unit} to go`
          : "No target set"}
      </p>
    </div>
  );
}

async function Day({ searchParams }: Pick<PageProps<"/nutrition">, "searchParams">) {
  const [sp, user, tz] = await Promise.all([searchParams, requireUser(), getTimeZone()]);
  await connection();
  const today = localDay(new Date(), tz);
  const raw = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const day = raw > today ? today : raw;
  // The meal the add form starts on, from the time of day where the user is.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(
      new Date(),
    ),
  );
  const defaultMeal =
    hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : ("snack" as const);

  const [log, targets, recent, profile, weights] = await Promise.all([
    dayLog(db, user.id, day),
    getTargets(db, user.id),
    recentFoods(db, user.id),
    getProfile(user.id),
    metricSeries(db, user.id, "weight"),
  ]);
  const trend = trendLine(dailyReadings(weights)).at(-1)?.value;
  const suggested = trend ? suggestTargets(trend, profile?.goal ?? "all_round") : null;
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/nutrition?day=${shift(day, -1)}`}
          className="text-muted-foreground hover:text-foreground p-2"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h2 className="font-semibold">{day === today ? `Today, ${label}` : label}</h2>
        <Link
          href={`/nutrition?day=${shift(day, 1)}`}
          aria-label="Next day"
          aria-disabled={day >= today}
          className={cn(
            "text-muted-foreground hover:text-foreground p-2",
            day >= today && "pointer-events-none opacity-30",
          )}
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardLabel>Food</CardLabel>
          <div className="mt-3">
            <FoodLog
              key={day}
              day={day}
              defaultMeal={defaultMeal}
              waterMl={log.waterMl}
              foods={log.foods}
              recent={recent.map((r) => ({
                name: r.name,
                meal: r.meal,
                calories: r.calories,
                proteinG: r.proteinG,
                carbsG: r.carbsG,
                fatG: r.fatG,
              }))}
            />
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardLabel>Targets</CardLabel>
          <Meter
            label="Calories"
            value={log.totals.calories}
            target={targets?.calories ?? null}
            unit="kcal"
          />
          <Meter
            label="Protein"
            value={log.totals.proteinG}
            target={targets?.proteinG ?? null}
            unit="g"
          />
          <Meter
            label="Carbs"
            value={log.totals.carbsG}
            target={targets?.carbsG ?? null}
            unit="g"
          />
          <Meter label="Fat" value={log.totals.fatG} target={targets?.fatG ?? null} unit="g" />
          <Meter label="Water" value={log.waterMl} target={targets?.waterMl ?? null} unit="ml" />
          <TargetsForm
            suggested={suggested}
            current={{
              calories: targets?.calories ?? null,
              proteinG: targets?.proteinG ?? null,
              carbsG: targets?.carbsG ?? null,
              fatG: targets?.fatG ?? null,
              waterMl: targets?.waterMl ?? null,
            }}
          />
        </Card>
      </div>
    </>
  );
}

export default function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  return (
    <>
      <PageHeader title="Body" subtitle="Weight, measurements, food and recovery" />
      <BodyTabs current="/nutrition" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Day searchParams={searchParams} />
      </Suspense>
    </>
  );
}
