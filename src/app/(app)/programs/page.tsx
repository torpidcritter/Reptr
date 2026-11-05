import { CalendarRange } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getTimeZone, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { localDay, weekOf } from "@/modules/analytics/insights";
import { addDays } from "@/modules/history/schedule";
import { blockWeek } from "@/modules/programs/block";
import { activeProgram } from "@/modules/programs/programs";
import { EndProgram } from "./end-program";
import { ProgramForm } from "./program-form";

export const metadata: Metadata = { title: "Training block" };

const short = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

async function Programs() {
  await connection();
  const user = await requireUser();
  const tz = await getTimeZone();
  const today = localDay(new Date(), tz);
  const program = await activeProgram(db, user.id);
  const where = program && blockWeek(program, today);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-3">
        {program && where ? (
          <Card>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{program.name}</p>
                <p className="text-muted-foreground text-sm">
                  {where.status === "upcoming"
                    ? `Starts ${short(program.startDate)}`
                    : where.status === "finished"
                      ? `Finished ${short(addDays(program.startDate, program.weeks * 7 - 1))}. Time to plan the next one.`
                      : `Week ${where.week} of ${program.weeks}${where.kind === "deload" ? " · deload" : ""}${where.nextDeload && where.kind !== "deload" ? ` · deload in week ${where.nextDeload}` : ""}`}
                </p>
              </div>
              <EndProgram name={program.name} />
            </div>
            <ol className="mt-4 grid grid-cols-4 gap-1.5 xl:grid-cols-8">
              {where.kinds.map((kind, i) => {
                const start = addDays(program.startDate, i * 7);
                const current = where.status === "active" && where.week === i + 1;
                const past =
                  where.status === "finished" || (where.status === "active" && i + 1 < where.week);
                return (
                  <li
                    key={i}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs",
                      kind === "deload" && "border-dashed",
                      past && "bg-muted text-muted-foreground",
                      current && "border-accent bg-accent-soft ring-accent ring-1",
                    )}
                  >
                    <span className="block font-medium">Week {i + 1}</span>
                    <span className="text-muted-foreground block">{short(start)}</span>
                    {kind === "deload" && (
                      <span className="text-accent block font-medium">Deload</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="text-muted-foreground mt-4 text-sm">
              {where.status === "active" && where.kind === "deload"
                ? "This is a deload week. Workouts you start from a routine begin with about half the sets at around 90% of the weight, so you recover and come back stronger."
                : "Build weeks: start each routine as usual and try to beat last time by a rep or a small jump in weight. Deload weeks start lighter automatically."}
            </p>
          </Card>
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="No training block"
            body="Run your weekly routines as a block of several weeks with a planned deload, so hard training is followed by recovery."
          />
        )}
        <p className="text-muted-foreground text-xs">
          A block runs on top of your weekly plan. Choose which days each routine falls on in{" "}
          <Link href="/routines" className="text-accent hover:underline">
            Routines
          </Link>
          .
        </p>
      </div>
      <Card className="h-fit">
        <CardLabel className="mb-3">{program ? "Start a new block" : "New block"}</CardLabel>
        <ProgramForm monday={weekOf(today)} replacing={!!program} />
      </Card>
    </div>
  );
}

export default function ProgramsPage() {
  return (
    <>
      <PageHeader title="Training block" subtitle="Weeks of training with planned deloads" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Programs />
      </Suspense>
    </>
  );
}
