import { Target } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { displayWeight, weightUnitLabel, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { Forecast } from "@/modules/goals/forecast";
import { listGoals, loggedExercises, type GoalView } from "@/modules/goals/goals";
import { GoalForm } from "./goal-form";
import { RemoveGoal } from "./remove-goal";

export const metadata: Metadata = { title: "Goals" };

const monthYear = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

const confidenceText = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
};

function forecastText(f: Forecast | null) {
  if (!f) return null;
  switch (f.status) {
    case "reached":
      return { main: "Reached. Nice work.", detail: null };
    case "on_track":
      return {
        main: `At this rate: around ${monthYear(f.eta)}`,
        detail: `${confidenceText[f.confidence]}, from ${f.basis}`,
      };
    case "not_moving":
      return { main: "Not heading toward the target right now", detail: `From ${f.basis}` };
    case "not_enough_data":
      return { main: "Not enough data for a forecast yet", detail: f.basis };
  }
}

function title(g: GoalView, units: UnitSystem) {
  const w = (kg: number) => `${displayWeight(kg, units, 1)} ${weightUnitLabel(units)}`;
  if (g.kind === "strength") return `${g.exerciseName} ${w(g.targetValue)} (est. 1RM)`;
  if (g.kind === "bodyweight") return `Body weight ${w(g.targetValue)}`;
  return `Train ${g.targetValue}× a week`;
}

function GoalCard({ g, units }: { g: GoalView; units: UnitSystem }) {
  const w = (kg: number) => `${displayWeight(kg, units, 1)} ${weightUnitLabel(units)}`;
  const f = forecastText(g.forecast);
  const name = title(g, units);
  return (
    <Card>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <p className="text-muted-foreground text-sm">
            {g.kind === "consistency"
              ? `Hit ${g.weeks!.weeksHit} of the last ${g.weeks!.weeks} weeks${g.weeks!.streak > 1 ? ` · ${g.weeks!.streak} weeks in a row` : ""} · ${g.weeks!.thisWeek} this week`
              : g.current != null
                ? `Now ${w(g.current)}${g.startValue != null ? ` · started at ${w(g.startValue)}` : ""}`
                : "No data yet"}
            {g.targetDate && ` · by ${monthYear(g.targetDate)}`}
          </p>
        </div>
        <RemoveGoal id={g.id} name={name} />
      </div>
      <div
        className="bg-muted mt-3 h-2 rounded-full"
        role="progressbar"
        aria-valuenow={g.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${g.progress}%`}
      >
        <div className="bg-accent h-2 rounded-full" style={{ width: `${g.progress}%` }} />
      </div>
      {f && (
        <div className="mt-3 text-sm">
          <p className={cn("font-medium", g.behind && "text-amber-600 dark:text-amber-400")}>
            {f.main}
            {g.behind && " (after your target date)"}
          </p>
          {f.detail && <p className="text-muted-foreground text-xs">{f.detail}</p>}
        </div>
      )}
    </Card>
  );
}

async function Goals() {
  const user = await requireUser();
  const [profile, tz] = await Promise.all([getProfile(user.id), getTimeZone()]);
  const units = profile?.unitSystem ?? "metric";
  const [goals, exercises] = await Promise.all([
    listGoals(db, user.id, tz),
    loggedExercises(db, user.id),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-3">
        {goals.length ? (
          goals.map((g) => <GoalCard key={g.id} g={g} units={units} />)
        ) : (
          <EmptyState
            icon={Target}
            title="No goals yet"
            body="Set a lift, body-weight or consistency goal and Reptr will track it and estimate when you'll get there."
          />
        )}
        {goals.some((g) => g.forecast?.status === "on_track") && (
          <p className="text-muted-foreground text-xs">
            Forecasts extend your recent trend in a straight line. Progress usually slows as you get
            closer, so treat dates as rough estimates, not promises.
          </p>
        )}
      </div>
      <Card className="h-fit">
        <CardLabel className="mb-3">New goal</CardLabel>
        <GoalForm exercises={exercises} unit={weightUnitLabel(units)} />
      </Card>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <>
      <PageHeader title="Goals" subtitle="Targets, progress and when you'll likely get there" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading goals…</p>}>
        <Goals />
      </Suspense>
    </>
  );
}
