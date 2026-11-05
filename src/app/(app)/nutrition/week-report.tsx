import { connection } from "next/server";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { nutritionReportFor } from "@/modules/nutrition/report-queries";

const fmt = (n: number) => Math.round(n).toLocaleString("en");

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}

const sureness = {
  low: "a rough first read",
  medium: "a fair estimate",
  high: "a solid estimate",
} as const;

/** The last 7 days of eating against targets, plus burn and a learned maintenance number. */
export async function WeekReport() {
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  await connection();
  const [r, profile] = await Promise.all([
    nutritionReportFor(db, user.id, tz, new Date()),
    getProfile(user.id),
  ]);
  const units = profile?.unitSystem ?? "metric";
  const w = r.week;

  if (!w.daysLogged) {
    return (
      <Card>
        <CardLabel>Last 7 days</CardLabel>
        <p className="text-muted-foreground mt-2 text-sm">
          Log food on a few days and a weekly summary shows up here.
        </p>
      </Card>
    );
  }

  const change = w.weightChangeKg;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <CardLabel>Last 7 days</CardLabel>
        <span className="text-muted-foreground text-xs">
          {w.daysLogged} of {w.daysInWeek} days logged
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Average calories"
          value={`${fmt(w.avgCalories!)} kcal`}
          note={
            r.targets?.calories
              ? `Target ${fmt(r.targets.calories)} · on target ${w.caloriesOnTarget} day${w.caloriesOnTarget === 1 ? "" : "s"}`
              : "No target set"
          }
        />
        <Stat
          label="Average protein"
          value={`${fmt(w.avgProteinG!)} g`}
          note={
            r.targets?.proteinG
              ? `Target ${fmt(r.targets.proteinG)} · hit ${w.proteinOnTarget} day${w.proteinOnTarget === 1 ? "" : "s"}`
              : "No target set"
          }
        />
        <Stat
          label="Weight trend"
          value={
            change == null
              ? "–"
              : `${change > 0 ? "+" : change < 0 ? "−" : ""}${displayWeight(Math.abs(change), units)} ${weightUnitLabel(units)}`
          }
          note={change == null ? "Weigh in to see the change" : "Change over the week"}
        />
        <Stat
          label="Burned by activity"
          value={r.burn ? `${fmt(w.avgBurned)} kcal/day` : "–"}
          note={
            r.burn
              ? `Training ${fmt(r.burn.training)} · walking ${fmt(r.burn.walking)} kcal this week${r.burn.stepDays ? "" : " (no steps logged)"}`
              : "Needs a weigh-in"
          }
        />
      </div>
      <div className="border-border mt-4 border-t pt-3 text-sm">
        {r.tdee ? (
          <p>
            <span className="font-medium">Your maintenance is about {fmt(r.tdee.kcal)} kcal.</span>{" "}
            <span className="text-muted-foreground">
              You averaged {fmt(r.tdee.avgIntake)} kcal over {r.tdee.days} logged days while your
              trend moved {r.tdee.weeklyRateKg > 0 ? "+" : r.tdee.weeklyRateKg < 0 ? "−" : ""}
              {displayWeight(Math.abs(r.tdee.weeklyRateKg), units, 2)} {weightUnitLabel(units)} a
              week. Based on 4 weeks, so treat it as {sureness[r.tdee.confidence]}.
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Log food on 14 or more of the last 28 days and weigh in a few times a week, and Reptr
            will estimate your maintenance calories from what actually happened.
          </p>
        )}
      </div>
    </Card>
  );
}
