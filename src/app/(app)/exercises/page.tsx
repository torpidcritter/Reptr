import { ChevronRight, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { equipmentList, muscles } from "@/db/seed/muscles";
import { listExercises } from "@/modules/exercises/queries";
import { ExerciseFilters } from "./filters";

export const metadata: Metadata = { title: "Exercises" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Muscle groups and equipment are fixed reference data, so they come from the seed list
// rather than the database and render into the static shell.
const muscleOptions = muscles.map(({ slug, name }) => ({ slug, name }));
const equipmentOptions = equipmentList
  .filter((e) => e.slug !== "none")
  .map(({ slug, name }) => ({ slug, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

async function Results({ searchParams }: Pick<PageProps<"/exercises">, "searchParams">) {
  const sp = await searchParams;
  const user = await requireUser();
  const items = await listExercises(db, user.id, {
    q: one(sp.q),
    muscle: one(sp.muscle),
    equipment: one(sp.equipment),
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No exercises match"
        body="Try a different search, clear a filter, or add it as your own exercise."
      />
    );
  }

  return (
    <>
      <p className="text-muted-foreground mb-2 text-sm">{items.length} exercises</p>
      <Card className="divide-y p-0">
        {items.map((e) => (
          <Link
            key={e.id}
            href={`/exercises/${e.id}`}
            className="hover:bg-muted flex items-center gap-3 px-4 py-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {e.name}
                {e.isCustom && (
                  <span className="bg-accent-soft text-accent ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                    Custom
                  </span>
                )}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                {[e.primaryMuscles.join(", "), e.equipment].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Link>
        ))}
      </Card>
    </>
  );
}

export default function ExercisesPage({ searchParams }: PageProps<"/exercises">) {
  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle="The built-in library plus your own"
        action={
          <Link href="/exercises/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New
          </Link>
        }
      />
      <Suspense fallback={<div className="mb-4 h-12" />}>
        <ExerciseFilters muscles={muscleOptions} equipment={equipmentOptions} />
      </Suspense>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading exercises…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}
