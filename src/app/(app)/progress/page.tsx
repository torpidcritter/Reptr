import { ChevronRight, History, LineChart, Ruler, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Progress" };

function Row({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:bg-muted flex items-center gap-4 transition-colors">
        <Icon className="text-accent size-5" />
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground text-sm">{body}</p>
        </div>
        <ChevronRight className="text-muted-foreground size-4" />
      </Card>
    </Link>
  );
}

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progress" />
      <div className="grid gap-3 md:grid-cols-2">
        <Row
          href="/physique"
          icon={Ruler}
          title="Body weight"
          body="Weigh-ins, trend and measurements"
        />
        <Row href="/history" icon={History} title="Workout history" body="Every finished workout" />
        <Row
          href="/achievements"
          icon={Trophy}
          title="Personal records"
          body="Your best lifts over time"
        />
        <Row
          href="/insights"
          icon={LineChart}
          title="Training analysis"
          body="Volume, strength and balance"
        />
      </div>
    </>
  );
}
