import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatRecord } from "@/lib/format";
import { recordLabels } from "@/modules/analytics/calc";
import { exerciseRecords } from "@/modules/analytics/records";
import { categories, measurements } from "@/modules/exercises/custom";
import { getExercise } from "@/modules/exercises/queries";

const label = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((x) => x.value === v)?.label ?? v;

async function ExerciseDetail({ params }: Pick<PageProps<"/exercises/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [exercise, records, profile, tz] = await Promise.all([
    getExercise(db, user.id, id),
    exerciseRecords(db, user.id, id),
    getProfile(user.id),
    getTimeZone(),
  ]);
  if (!exercise) notFound();
  const units = profile?.unitSystem ?? "metric";

  const facts = [
    label(categories, exercise.category),
    exercise.equipment,
    label(measurements, exercise.measurement),
    exercise.isUnilateral ? "One side at a time" : null,
  ].filter(Boolean);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{exercise.name}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{facts.join(" · ")}</p>

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
          {exercise.formCues && (
            <>
              <CardLabel className="mt-5">Form cues</CardLabel>
              <p className="mt-2 text-sm whitespace-pre-line">{exercise.formCues}</p>
            </>
          )}
        </Card>
      </div>
    </>
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
