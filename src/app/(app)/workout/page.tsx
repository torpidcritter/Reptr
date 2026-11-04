import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkoutScreen } from "@/components/workout/workout-screen";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { listRoutines } from "@/modules/routines/routines";

export const metadata: Metadata = { title: "Workout" };

async function Screen({ searchParams }: Pick<PageProps<"/workout">, "searchParams">) {
  const [{ routine, repeat }, user] = await Promise.all([searchParams, requireUser()]);
  const [routines, profile] = await Promise.all([listRoutines(db, user.id), getProfile(user.id)]);
  return (
    <WorkoutScreen
      routines={routines.map(({ id, name, exerciseCount }) => ({ id, name, exerciseCount }))}
      settings={{
        unitSystem: profile?.unitSystem ?? "metric",
        defaultRestSeconds: profile?.defaultRestSeconds ?? 90,
      }}
      startFrom={
        typeof routine === "string"
          ? { routine }
          : typeof repeat === "string"
            ? { repeat }
            : undefined
      }
    />
  );
}

export default function WorkoutPage({ searchParams }: PageProps<"/workout">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Screen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
