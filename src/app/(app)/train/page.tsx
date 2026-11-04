import { ChevronRight, Dumbbell, Library, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Train" };

export default function Page() {
  return (
    <>
      <PageHeader title="Train" subtitle="Routines, live workouts and history" />
      <Link href="/routines" className="mb-3 block">
        <Card className="hover:bg-muted flex items-center gap-4 transition-colors">
          <div className="bg-accent-soft flex size-11 items-center justify-center rounded-xl">
            <ListChecks className="text-accent size-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Routines</p>
            <p className="text-muted-foreground text-sm">Push, pull, legs and your other plans</p>
          </div>
          <ChevronRight className="text-muted-foreground size-4" />
        </Card>
      </Link>
      <Link href="/exercises" className="mb-4 block">
        <Card className="hover:bg-muted flex items-center gap-4 transition-colors">
          <div className="bg-accent-soft flex size-11 items-center justify-center rounded-xl">
            <Library className="text-accent size-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Exercise library</p>
            <p className="text-muted-foreground text-sm">Browse, search and add your own</p>
          </div>
          <ChevronRight className="text-muted-foreground size-4" />
        </Card>
      </Link>
      <EmptyState
        icon={Dumbbell}
        title="No workouts yet"
        body="The live workout logger arrives in the next build step."
      />
    </>
  );
}
