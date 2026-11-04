import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { equipmentList, muscles } from "@/db/seed/muscles";
import { NewExerciseForm } from "./new-exercise-form";

export const metadata: Metadata = { title: "New exercise" };

const muscleOptions = muscles.map(({ slug, name }) => ({ slug, name }));
const equipmentOptions = equipmentList
  .filter((e) => e.slug !== "none")
  .map(({ slug, name }) => ({ slug, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function NewExercisePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="New exercise" subtitle="Add a movement that isn't in the library" />
      <Card className="p-5">
        <Suspense fallback={null}>
          <NewExerciseForm muscles={muscleOptions} equipment={equipmentOptions} />
        </Suspense>
      </Card>
    </div>
  );
}
