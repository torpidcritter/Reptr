import { Ruler } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Physique" };

export default function Page() {
  return (
    <>
      <PageHeader title="Physique" subtitle="Body weight, measurements and photos" />
      <EmptyState
        icon={Ruler}
        title="No measurements yet"
        body="Log your weight and measurements here to track your physique over time."
      />
    </>
  );
}
