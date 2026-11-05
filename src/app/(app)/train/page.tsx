import {
  CalendarDays,
  ChevronRight,
  Library,
  ListChecks,
  Play,
  Target,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Train" };

function NavCard({
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
        <div className="bg-accent-soft flex size-11 items-center justify-center rounded-xl">
          <Icon className="text-accent size-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground text-sm">{body}</p>
        </div>
        <ChevronRight className="text-muted-foreground size-4" />
      </Card>
    </Link>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Train" subtitle="Routines, live workouts and history" />
      <Link href="/workout" className={buttonVariants({ size: "lg", className: "mb-4 w-full" })}>
        <Play /> Start workout
      </Link>
      <div className="grid gap-3 md:grid-cols-2">
        <NavCard
          href="/routines"
          icon={ListChecks}
          title="Routines"
          body="Push, pull, legs and your other plans"
        />
        <NavCard
          href="/history"
          icon={CalendarDays}
          title="Calendar"
          body="Your weekly plan and past workouts"
        />
        <NavCard
          href="/exercises"
          icon={Library}
          title="Exercise library"
          body="Browse, search and add your own"
        />
        <NavCard
          href="/goals"
          icon={Target}
          title="Goals"
          body="Targets for lifts, body weight and consistency"
        />
        <NavCard
          href="/achievements"
          icon={Trophy}
          title="Achievements"
          body="Milestones and your personal records timeline"
        />
      </div>
    </>
  );
}
