import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { getRoutine } from "@/modules/routines/routines";
import { RoutineBuilder, type BuilderItem } from "../../routine-builder";

export const metadata: Metadata = { title: "Edit routine" };

async function Editor({ params }: Pick<PageProps<"/routines/[id]/edit">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const routine = await getRoutine(db, user.id, id);
  if (!routine) notFound();

  const items: BuilderItem[] = routine.items.map((item, i, all) => ({
    key: `${i}-${item.exerciseId}`,
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseName,
    targetSets: item.targetSets,
    targetRepsMin: item.targetRepsMin,
    targetRepsMax: item.targetRepsMax,
    restSeconds: item.restSeconds,
    linkNext: item.supersetGroup != null && all[i + 1]?.supersetGroup === item.supersetGroup,
  }));

  return (
    <RoutineBuilder
      initial={{
        id: routine.id,
        name: routine.name,
        notes: routine.notes,
        scheduleDays: routine.scheduleDays,
        items,
      }}
    />
  );
}

export default function EditRoutinePage({ params }: PageProps<"/routines/[id]/edit">) {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Edit routine" subtitle="Changes apply to future workouts only" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}
