import { Dumbbell } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Train" };

export default function Page() {
  return (
    <>
      <PageHeader title="Train" subtitle="Routines, live workouts and history" />
      <EmptyState
        icon={Dumbbell}
        title="No workouts yet"
        body="Routines and the live workout logger arrive in the next build steps."
      />
    </>
  );
}
