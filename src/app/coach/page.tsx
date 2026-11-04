import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Coach" };

export default function Page() {
  return (
    <>
      <PageHeader title="Coach" subtitle="Your AI training coach" />
      <EmptyState
        icon={Bot}
        title="Coach comes later"
        body="The AI coach arrives after the tracker has real training data to work from."
      />
    </>
  );
}
