import { ArrowLeft, Bot, GitCompareArrows, Repeat, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel, CardValue } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatDuration, formatVolume } from "@/lib/format";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { recordLabels } from "@/modules/analytics/calc";
import { recordsForWorkout } from "@/modules/analytics/records";
import { adherence } from "@/modules/workouts/estimate";
import { summarize } from "@/modules/workouts/snapshot";
import { previousComparable } from "@/modules/history/history";
import { getWorkout } from "@/modules/workouts/workouts";
import { sessionReviewFor } from "@/modules/coach/review-queries";
import { cn } from "@/lib/utils";
import { PendingWorkout } from "./pending";

export const metadata: Metadata = { title: "Workout" };

const typeTag = { warmup: "W", working: "", drop: "D", failure: "F", rest_pause: "RP" } as const;

async function Summary({ params }: Pick<PageProps<"/history/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [user, tz] = await Promise.all([requireUser(), getTimeZone()]);
  const [w, profile, prs, prev, review] = await Promise.all([
    getWorkout(db, user.id, id),
    getProfile(user.id),
    recordsForWorkout(db, user.id, id),
    previousComparable(db, user.id, id),
    sessionReviewFor(db, user.id, id, tz),
  ]);
  const prCount = Object.values(prs).flat().length;
  if (!w || w.status === "active" || w.status === "paused") return <PendingWorkout id={id} />;
  if (w.status === "abandoned") notFound();

  const units = profile?.unitSystem ?? "metric";
  const stats = summarize(w);
  const plan = adherence(stats.sets, w.plannedSets);
  const start = new Date(w.startedAt);
  const duration = w.finishedAt ? Date.parse(w.finishedAt) - start.getTime() : 0;

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{w.name}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(start, tz, { year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {prev && (
            <Link
              href={`/history/compare?a=${prev.id}&b=${w.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <GitCompareArrows /> Compare with last time
            </Link>
          )}
          <Link
            href={`/workout?repeat=${w.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Repeat /> Repeat
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card>
          <CardLabel>Time</CardLabel>
          <CardValue>{formatDuration(duration)}</CardValue>
        </Card>
        <Card>
          <CardLabel>Sets</CardLabel>
          <CardValue>{stats.sets}</CardValue>
          {plan && plan.planned !== plan.done && (
            <p className="text-muted-foreground mt-1 text-xs">
              of {plan.planned} planned ({plan.percent}%)
            </p>
          )}
        </Card>
        <Card>
          <CardLabel>Volume</CardLabel>
          <CardValue className="text-xl">
            {stats.volumeKg > 0 ? formatVolume(stats.volumeKg, units) : "—"}
          </CardValue>
        </Card>
      </div>

      {prCount > 0 && (
        <p className="bg-accent/10 text-accent mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
          <Trophy className="size-4" /> {prCount} personal {prCount === 1 ? "record" : "records"}{" "}
          this workout
        </p>
      )}

      {review && (
        <Card className="mb-4">
          <CardLabel>Session review</CardLabel>
          <p className="mt-1 font-semibold">{review.headline}</p>
          {review.points.some((p) => p.kind !== "records") && (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {review.points
                .filter((p) => p.kind !== "records")
                .map((p) => (
                  <li key={p.text} className="flex gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        p.tone === "good"
                          ? "bg-accent"
                          : p.tone === "watch"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/50",
                      )}
                    />
                    {p.text}
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">{review.basis}</p>
            <Link
              href={`/coach?ask=${encodeURIComponent(`Review my ${w.name} workout on ${review.workout.date}. What should I change next time?`)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Bot /> Ask the coach
            </Link>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {w.exercises.map((e) => (
          <Card key={e.id}>
            <Link href={`/exercises/${e.exerciseId}`} className="font-semibold hover:underline">
              {e.name}
            </Link>
            <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
              {e.sets.map((s, i) => (
                <li key={s.id} className="flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground w-6">{typeTag[s.type] || i + 1}</span>
                  <span>
                    {[
                      s.weightKg != null &&
                        `${displayWeight(s.weightKg, units, 2)} ${weightUnitLabel(units)}`,
                      s.reps != null && `${s.reps} reps`,
                      s.distanceMeters != null &&
                        (units === "metric"
                          ? `${(s.distanceMeters / 1000).toFixed(2)} km`
                          : `${(s.distanceMeters / 1609.344).toFixed(2)} mi`),
                      s.durationSeconds != null &&
                        formatDuration(s.durationSeconds * 1000).replace(
                          /^0m$/,
                          `${s.durationSeconds}s`,
                        ),
                    ]
                      .filter(Boolean)
                      .join(" × ")}
                  </span>
                  {(s.rpe != null || s.rir != null || s.tempo) && (
                    <span className="text-muted-foreground">
                      {[
                        s.rpe != null && `RPE ${s.rpe}`,
                        s.rir != null && `${s.rir} RIR`,
                        s.tempo && `tempo ${s.tempo}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {s.note && (
                    <span className="text-muted-foreground basis-full pl-9">{s.note}</span>
                  )}
                  {prs[s.id] && (
                    <span
                      className="text-accent inline-flex basis-full items-center gap-1 pl-9 text-xs font-medium"
                      title={prs[s.id].map((t) => recordLabels[t]).join(", ")}
                    >
                      <Trophy className="size-3.5" />
                      {prs[s.id].map((t) => recordLabels[t]).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function WorkoutSummaryPage({ params }: PageProps<"/history/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/history"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> History
      </Link>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Summary params={params} />
      </Suspense>
    </div>
  );
}
