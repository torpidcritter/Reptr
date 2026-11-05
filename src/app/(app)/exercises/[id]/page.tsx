import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatRecord } from "@/lib/format";
import { recordLabels } from "@/modules/analytics/calc";
import { MetricChart, type MetricKind } from "@/components/charts/metric-chart";
import { exerciseRecords, exerciseSessions } from "@/modules/analytics/records";
import { isPlateau, sessionStats, suggestNext } from "@/modules/analytics/progression";
import { displayWeight, weightUnitLabel } from "@/lib/units";
import { categories, measurements } from "@/modules/exercises/custom";
import { getExercise, similarExercises } from "@/modules/exercises/queries";

const label = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((x) => x.value === v)?.label ?? v;

async function ExerciseDetail({ params }: Pick<PageProps<"/exercises/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [exercise, records, sessions, profile, tz, alternatives] = await Promise.all([
    getExercise(db, user.id, id),
    exerciseRecords(db, user.id, id),
    exerciseSessions(db, user.id, id),
    getProfile(user.id),
    getTimeZone(),
    similarExercises(db, user.id, id, 5),
  ]);
  if (!exercise) notFound();
  const units = profile?.unitSystem ?? "metric";

  // What "progress" means depends on what the exercise logs.
  const m = exercise.measurement;
  const weighted = m === "weight_reps";
  const stats = sessions.map(sessionStats);
  const metric: {
    kind: MetricKind;
    name: string;
    pick: (s: (typeof stats)[number]) => number | null;
  } = weighted
    ? {
        kind: "weight",
        name: "Best estimated 1RM per session",
        pick: (s) => s.bestE1rm ?? s.topWeight,
      }
    : m === "time"
      ? { kind: "duration", name: "Longest set per session", pick: (s) => s.bestDuration }
      : m === "distance_time"
        ? { kind: "distance", name: "Longest distance per session", pick: (s) => s.bestDistance }
        : { kind: "reps", name: "Best set (reps) per session", pick: (s) => s.bestReps };
  const points = stats
    .map((s) => ({ x: Date.parse(s.date), y: metric.pick(s) }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  const stalled = isPlateau(stats.map(metric.pick));
  const reps = m === "weight_reps" || m === "reps" || m === "assisted_reps";
  const next = reps
    ? suggestNext(sessions.at(-1)?.sets, {
        weighted,
        incrementKg: units === "metric" ? 2.5 : 2.26796,
      })
    : null;
  const w = (kg: number) => `${displayWeight(kg, units, 1)} ${weightUnitLabel(units)}`;

  const facts = [
    exercise.difficulty && difficultyLabels[exercise.difficulty],
    label(categories, exercise.category),
    exercise.equipment,
    label(measurements, exercise.measurement),
    exercise.isUnilateral ? "One side at a time" : null,
  ].filter(Boolean);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{exercise.name}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{facts.join(" · ")}</p>

      {sessions.length > 0 && (
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardLabel>{metric.name}</CardLabel>
            <div className="mt-3">
              <MetricChart points={points} kind={metric.kind} units={units} name={metric.name} />
            </div>
          </Card>
          <Card>
            <CardLabel>Next time</CardLabel>
            {next && next.kind !== "start" ? (
              <>
                <p className="mt-2 text-2xl font-semibold">
                  {next.weightKg != null
                    ? `${w(next.weightKg)} × ${next.reps}`
                    : `${next.reps} reps`}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">{next.reason}</p>
              </>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">Beat your best from last time.</p>
            )}
            {stalled && (
              <p className="border-border mt-4 border-t pt-3 text-sm">
                <span className="font-medium">No new best in 3 sessions.</span>{" "}
                <span className="text-muted-foreground">
                  Try a lighter week, a different rep range, or a variation for a few weeks.
                </span>
              </p>
            )}
            <CardLabel className="mt-5">Recent sessions</CardLabel>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {stats
                .slice(-5)
                .reverse()
                .map((s) => (
                  <li key={s.workoutId} className="flex justify-between gap-2">
                    <Link
                      href={`/history/${s.workoutId}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {formatDate(new Date(s.date), tz)}
                    </Link>
                    <span className="tabular-nums">
                      {s.workingSets} sets
                      {metric.pick(s) != null &&
                        ` · ${formatRecord(
                          metric.kind === "weight"
                            ? "best_e1rm"
                            : metric.kind === "duration"
                              ? "longest_duration"
                              : metric.kind === "distance"
                                ? "longest_distance"
                                : "most_reps",
                          metric.pick(s)!,
                          units,
                        )}`}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardLabel>Muscles worked</CardLabel>
          <ul className="mt-3 flex flex-col gap-3">
            {exercise.muscles.map((m) => (
              <li key={m.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground">
                    {m.role === "primary" ? "Primary" : "Secondary"}
                  </span>
                </div>
                <div className="bg-muted h-2 rounded-full">
                  <div
                    className="bg-accent h-2 rounded-full"
                    style={{ width: `${Math.round(m.contribution * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardLabel>Personal records</CardLabel>
          {records.length ? (
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {records.map((r) => (
                <div key={r.type} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{recordLabels[r.type]}</dt>
                  <dd className="text-right">
                    <span className="font-semibold tabular-nums">
                      {formatRecord(r.type, r.value, units)}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {formatDate(r.achievedAt, tz, { weekday: undefined, year: "numeric" })}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              Your best lifts for this exercise show up here once you log it in a workout.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(exercise.formCues || exercise.commonMistakes || exercise.safetyNotes) && (
          <Card>
            <Notes title="How to do it" text={exercise.formCues} numbered />
            <Notes title="Common mistakes" text={exercise.commonMistakes} />
            <Notes title="Safety" text={exercise.safetyNotes} />
            {exercise.safetyNotes && (
              <p className="text-muted-foreground mt-4 text-xs">
                General guidance, not medical advice. If something hurts, stop and get it checked.
              </p>
            )}
          </Card>
        )}
        {alternatives.length > 0 && (
          <Card>
            <CardLabel>Alternatives</CardLabel>
            <p className="text-muted-foreground mt-1 text-xs">
              Similar training effect, for when the equipment is busy or something doesn&apos;t feel
              right.
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {alternatives.map((a) => (
                <li key={a.id}>
                  <Link href={`/exercises/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-muted-foreground text-xs">{a.reason}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

const difficultyLabels = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

/** A titled list from one-per-line text. Renders nothing when there's no text. */
function Notes({
  title,
  text,
  numbered,
}: {
  title: string;
  text: string | null;
  numbered?: boolean;
}) {
  if (!text) return null;
  const items = text.split("\n").filter(Boolean);
  const List = numbered ? "ol" : "ul";
  return (
    <div className="mt-4 first:mt-0">
      <CardLabel>{title}</CardLabel>
      <List
        className={`mt-2 flex flex-col gap-1 pl-5 text-sm ${numbered ? "list-decimal" : "list-disc"}`}
      >
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </List>
    </div>
  );
}

export default function ExercisePage({ params }: PageProps<"/exercises/[id]">) {
  return (
    <>
      <Link
        href="/exercises"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Exercises
      </Link>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <ExerciseDetail params={params} />
      </Suspense>
    </>
  );
}
