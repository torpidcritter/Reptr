import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatDuration, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthGrid, monthKey, parseMonth } from "@/modules/history/calendar";
import { listWorkoutHistory } from "@/modules/history/history";

export const metadata: Metadata = { title: "History" };

async function HistoryMonth({ searchParams }: Pick<PageProps<"/history">, "searchParams">) {
  const [{ month: monthParam }, user, tz] = await Promise.all([
    searchParams,
    requireUser(),
    getTimeZone(),
  ]);
  const profile = await getProfile(user.id);
  const units = profile?.unitSystem ?? "metric";
  const { year, month } = parseMonth(typeof monthParam === "string" ? monthParam : undefined);

  // A day either side covers every time zone; the list is then filtered to local days.
  const from = new Date(Date.UTC(year, month, 1) - 86400000);
  const to = new Date(Date.UTC(year, month + 1, 1) + 86400000);
  const key = monthKey(year, month);
  const all = await listWorkoutHistory(db, user.id, { from, to });
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const items = all.filter((w) => dayOf(w.startedAt).startsWith(key));
  const days = new Set(items.map((w) => dayOf(w.startedAt)));
  const today = dayOf(new Date());
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));

  return (
    <>
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <Link
            href={`/history?month=${monthKey(year, month - 1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Link>
          <p className="font-semibold">
            {label} · {items.length} workout{items.length === 1 ? "" : "s"}
          </p>
          <Link
            href={`/history?month=${monthKey(year, month + 1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next month"
          >
            <ChevronRight />
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-muted-foreground pb-1 font-medium">
              {d}
            </span>
          ))}
          {monthGrid(year, month)
            .flat()
            .map((d) => (
              <span
                key={d.date}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg tabular-nums",
                  !d.inMonth && "opacity-30",
                  days.has(d.date) && "bg-accent text-accent-foreground font-semibold",
                  d.date === today && !days.has(d.date) && "ring-accent ring-1",
                )}
                aria-label={days.has(d.date) ? `${d.date}: trained` : d.date}
              >
                {Number(d.date.slice(8))}
              </span>
            ))}
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No workouts this month"
          body="Finished workouts show up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((w) => (
            <Link key={w.id} href={`/history/${w.id}`}>
              <Card className="hover:bg-muted transition-colors">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-muted-foreground text-xs">{formatDate(w.startedAt, tz)}</p>
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {[
                    w.finishedAt && formatDuration(w.finishedAt.getTime() - w.startedAt.getTime()),
                    `${w.setCount} sets`,
                    w.volumeKg > 0 && formatVolume(w.volumeKg, units),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
                  {w.exerciseNames.join(", ")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <>
      <PageHeader title="History" subtitle="Every workout you've finished" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading history…</p>}>
        <HistoryMonth searchParams={searchParams} />
      </Suspense>
    </>
  );
}
