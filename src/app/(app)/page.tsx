import { Dumbbell, Play } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel, CardValue } from "@/components/ui/card";

const stats = [
  { label: "Body weight", hint: "Weekly trend" },
  { label: "Workouts this week", hint: "Training target" },
  { label: "Daily steps", hint: "Target 10,000" },
  { label: "Protein", hint: "Daily target" },
];

export default function Home() {
  return (
    <>
      <PageHeader title="Today" subtitle="Your training at a glance" />

      <Card className="mb-4 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-accent-soft flex size-12 items-center justify-center rounded-xl">
            <Dumbbell className="text-accent size-6" />
          </div>
          <div>
            <CardLabel>Today&apos;s workout</CardLabel>
            <p className="mt-0.5 text-lg font-semibold">No routine planned yet</p>
          </div>
        </div>
        <Link href="/train" className={buttonVariants({ size: "lg" })}>
          <Play /> Start workout
        </Link>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardLabel>{s.label}</CardLabel>
            <CardValue className="text-muted-foreground">—</CardValue>
            <p className="text-muted-foreground mt-1 text-xs">{s.hint}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
