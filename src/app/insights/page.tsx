import { LineChart } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Insights" };

export default function Page() {
  return (
    <>
      <PageHeader title="Insights" subtitle="Strength, volume and muscle analytics" />
      <EmptyState
        icon={LineChart}
        title="Nothing to analyse yet"
        body="Charts appear here once you have logged a few workouts."
      />
    </>
  );
}
