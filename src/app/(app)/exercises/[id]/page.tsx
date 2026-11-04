import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { categories, measurements } from "@/modules/exercises/custom";
import { getExercise } from "@/modules/exercises/queries";

const label = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((x) => x.value === v)?.label ?? v;

async function ExerciseDetail({ params }: Pick<PageProps<"/exercises/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const exercise = await getExercise(db, user.id, id);
  if (!exercise) notFound();

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
          <CardLabel>Your history</CardLabel>
          <p className="text-muted-foreground mt-3 text-sm">
            Past sets, best lifts and progress for this exercise show up here once you log it in a
            workout.
          </p>
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
