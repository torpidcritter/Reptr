import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { compareWorkouts, type ExerciseSummary } from "@/modules/history/compare";
import { getWorkout } from "@/modules/workouts/workouts";

export const metadata: Metadata = { title: "Compare workouts" };

const uuid = /^[0-9a-f-]{36}$/i;

function Delta({ value, unit, digits = 1 }: { value: number; unit: string; digits?: number }) {
  if (Math.abs(value) < 10 ** -digits / 2)
    return <span className="text-muted-foreground">same</span>;
  const up = value > 0;
  return (
    <span className={cn("font-medium", up ? "text-accent" : "text-muted-foreground")}>
      {up ? "+" : "−"}
      {Math.abs(value).toLocaleString("en", { maximumFractionDigits: digits })}
      {unit}
    </span>
  );
}

function SideCell({ s, units }: { s: ExerciseSummary | null; units: UnitSystem }) {
  if (!s) return <span className="text-muted-foreground">Not done</span>;
  const w = (kg: number) => `${displayWeight(kg, units, 1)}`;
  return (
    <span className="tabular-nums">
      {s.topSet?.weightKg != null
        ? `${w(s.topSet.weightKg)} × ${s.topSet.reps ?? "–"}`
        : `${s.sets} sets`}
      <span className="text-muted-foreground block text-xs">
        {s.sets} sets{s.volumeKg > 0 && ` · ${formatVolume(s.volumeKg, units)}`}
      </span>
    </span>
  );
}

async function Comparison({ searchParams }: Pick<PageProps<"/history/compare">, "searchParams">) {
  const { a, b } = await searchParams;
  if (typeof a !== "string" || typeof b !== "string" || !uuid.test(a) || !uuid.test(b)) notFound();
  const user = await requireUser();
  const [older, newer, profile, tz] = await Promise.all([
    getWorkout(db, user.id, a),
    getWorkout(db, user.id, b),
    getProfile(user.id),
    getTimeZone(),
  ]);
  if (!older || !newer || older.status !== "completed" || newer.status !== "completed") notFound();
  const units = profile?.unitSystem ?? "metric";
  const c = compareWorkouts(older, newer);
  const unit = weightUnitLabel(units);
  const toUnits = (kg: number) => displayWeight(kg, units, 2);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Compare workouts</h1>
      <div className="text-muted-foreground mt-1 mb-6 grid grid-cols-2 gap-3 text-sm">
        <Link href={`/history/${older.id}`} className="hover:underline">
          Before: {older.name}, {formatDate(new Date(older.startedAt), tz)}
        </Link>
        <Link href={`/history/${newer.id}`} className="hover:underline">
          After: {newer.name}, {formatDate(new Date(newer.startedAt), tz)}
        </Link>
      </div>

      <Card className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="tabular-nums">
          {c.before.sets} sets · {formatVolume(c.before.volumeKg, units)}
        </span>
        <span className="tabular-nums">
          {c.after.sets} sets · {formatVolume(c.after.volumeKg, units)}{" "}
          <Delta
            value={toUnits(c.after.volumeKg - c.before.volumeKg)}
            unit={` ${unit}`}
            digits={0}
          />
        </span>
      </Card>

      <div className="flex flex-col gap-2">
        {c.rows.map((r) => (
          <Card key={r.exerciseId} className="grid grid-cols-3 items-start gap-3 text-sm">
            <Link href={`/exercises/${r.exerciseId}`} className="font-medium hover:underline">
              {r.name}
            </Link>
            <SideCell s={r.before} units={units} />
            <div>
              <SideCell s={r.after} units={units} />
              {r.before?.bestE1rm != null && r.after?.bestE1rm != null && (
                <p className="mt-1 text-xs">
                  Est. 1RM{" "}
                  <Delta value={toUnits(r.after.bestE1rm - r.before.bestE1rm)} unit={` ${unit}`} />
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function ComparePage({ searchParams }: PageProps<"/history/compare">) {
  return (
    <>
      <Link
        href="/history"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Calendar
      </Link>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Comparison searchParams={searchParams} />
      </Suspense>
    </>
  );
}
