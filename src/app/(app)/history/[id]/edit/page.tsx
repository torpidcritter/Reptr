import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { getWorkout } from "@/modules/workouts/workouts";
import { WorkoutEditor } from "./workout-editor";

export const metadata: Metadata = { title: "Correct workout" };

async function Editor({ params }: Pick<PageProps<"/history/[id]/edit">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [w, profile] = await Promise.all([getWorkout(db, user.id, id), getProfile(user.id)]);
  if (!w || w.status !== "completed") notFound();
  const { plannedSets, ...snapshot } = w;
  void plannedSets;
  return <WorkoutEditor workout={snapshot} units={profile?.unitSystem ?? "metric"} />;
}

export default function Page({ params }: PageProps<"/history/[id]/edit">) {
  return (
    <>
      <PageHeader title="Correct workout" />
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}
