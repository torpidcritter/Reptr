import { CheckCircle2, Circle, History, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate, formatRecord } from "@/lib/format";
import { milestones } from "@/modules/achievements/milestones";
import { recordLabels } from "@/modules/analytics/calc";
import { localDay, weekOf } from "@/modules/analytics/insights";
import { recentRecords } from "@/modules/analytics/records";
import { listWorkoutHistory } from "@/modules/history/history";

export const metadata: Metadata = { title: "Achievements" };

const dayText = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

async function Achievements() {
  const user = await requireUser();
  const [profile, tz] = await Promise.all([getProfile(user.id), getTimeZone()]);
  const units = profile?.unitSystem ?? "metric";
  const [history, records] = await Promise.all([
    listWorkoutHistory(db, user.id, { limit: 5000 }),
    recentRecords(db, user.id, 300),
  ]);
  const points = history
    .toReversed()
    .map((w) => ({ day: localDay(w.startedAt, tz), volumeKg: w.volumeKg }));
  const list = milestones(points, weekOf);

  // One row per exercise per month: its records that month, headlined by the strongest kind.
  const order = [
    "best_e1rm",
    "heaviest_weight",
    "most_reps",
    "best_set_volume",
    "longest_distance",
    "longest_duration",
  ] as const;
  type Row = { exerciseId: string; exercise: string; last: Date; recs: (typeof records)[number][] };
  const months = new Map<string, Map<string, Row>>();
  for (const r of records) {
    const key = formatDate(r.achievedAt, tz, {
      weekday: undefined,
      day: undefined,
      year: "numeric",
    });
    const month = months.get(key) ?? new Map<string, Row>();
    months.set(key, month);
    const row = month.get(r.exerciseId) ?? {
      exerciseId: r.exerciseId,
      exercise: r.exercise,
      last: r.achievedAt,
      recs: [],
    };
    month.set(r.exerciseId, row);
    // Keep only the latest of each record type within the month.
    if (!row.recs.some((x) => x.type === r.type)) row.recs.push(r);
  }
  const headline = (row: Row) =>
    [...row.recs].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0];

  if (!history.length) {
    return (
      <EmptyState
        icon={Trophy}
        title="Nothing here yet"
        body="Finish your first workout and your milestones and personal records will show up here."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
      <Card className="h-fit">
        <CardLabel className="mb-3">Milestones</CardLabel>
        <ul className="flex flex-col gap-3 text-sm">
          {list.map((m) => (
            <li key={m.key} className="flex items-start gap-2.5">
              {m.reachedOn ? (
                <CheckCircle2 className="text-accent mt-0.5 size-4 shrink-0" />
              ) : (
                <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className={m.reachedOn ? "font-medium" : "text-muted-foreground"}>{m.title}</p>
                {m.reachedOn ? (
                  <p className="text-muted-foreground text-xs">{dayText(m.reachedOn)}</p>
                ) : (
                  <div
                    className="bg-muted mt-1.5 h-1.5 rounded-full"
                    role="progressbar"
                    aria-valuenow={m.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${m.title}: ${m.progress}%`}
                  >
                    <div
                      className="bg-accent h-1.5 rounded-full"
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-4">
        {records.length ? (
          [...months].map(([month, rows]) => (
            <Card key={month}>
              <CardLabel className="mb-3">
                {month} · records on {rows.size} exercise{rows.size === 1 ? "" : "s"}
              </CardLabel>
              <ul className="flex flex-col gap-2.5 text-sm">
                {[...rows.values()].map((row) => {
                  const top = headline(row);
                  return (
                    <li key={row.exerciseId} className="flex items-start gap-2">
                      <Trophy className="text-accent mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/exercises/${row.exerciseId}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {row.exercise}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {row.recs
                            .map((r) => r.type)
                            .sort((a, b) => order.indexOf(a) - order.indexOf(b))
                            .map((t) => recordLabels[t])
                            .join(", ")}{" "}
                          · {formatDate(row.last, tz)}
                        </span>
                      </div>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">
                          {formatRecord(top.type, top.value, units)}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {recordLabels[top.type]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-muted-foreground text-sm">No personal records yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  return (
    <>
      <PageHeader
        title="Achievements"
        subtitle="Milestones and every personal record, by month"
        action={
          <Link href="/timeline" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <History /> Timeline
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Achievements />
      </Suspense>
    </>
  );
}
