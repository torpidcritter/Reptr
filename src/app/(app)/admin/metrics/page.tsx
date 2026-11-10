import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { isModerator } from "@/modules/community/moderation";
import { betaMetrics } from "@/modules/metrics/beta";

export const metadata: Metadata = { title: "Beta metrics", robots: { index: false } };

const pct = (part: number, whole: number) =>
  whole === 0 ? "–" : `${Math.round((100 * part) / whole)}%`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </Card>
  );
}

async function Metrics() {
  const user = await requireUser();
  // The page doesn't exist for anyone else.
  if (!isModerator(user.id)) notFound();
  const m = await betaMetrics(db, user.id);
  const lastFull = m.weeks.at(-2);
  const target: Record<number, string> = { 7: "target 40%", 30: "target 20%" };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Accounts" value={String(m.accounts)} note={`${m.newThisWeek} new this week`} />
        <Stat
          label="Trained in the last 7 days"
          value={String(m.weeklyActive)}
          note={`${pct(m.weeklyActive, m.accounts)} of accounts`}
        />
        <Stat
          label="Workouts per active person, last full week"
          value={
            lastFull && lastFull.activeUsers
              ? (lastFull.workouts / lastFull.activeUsers).toFixed(1)
              : "–"
          }
        />
        <Stat
          label="Follows per social profile"
          value={m.followsPerProfile.toFixed(1)}
          note={`${m.socialProfiles} social profiles`}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Coming back</h2>
        <p className="text-muted-foreground text-sm">
          Of the people who signed up at least N days ago (in the last 90 days), how many finished a
          workout on day N or later. Targets are hypotheses for the beta.
        </p>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Day</th>
                <th className="px-4 py-2 font-medium">Signed up</th>
                <th className="px-4 py-2 font-medium">Came back</th>
                <th className="px-4 py-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {m.retention.map((r) => (
                <tr key={r.day}>
                  <td className="px-4 py-2">D{r.day}</td>
                  <td className="px-4 py-2 tabular-nums">{r.cohort}</td>
                  <td className="px-4 py-2 tabular-nums">{r.retained}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {pct(r.retained, r.cohort)}
                    {target[r.day] && (
                      <span className="text-muted-foreground"> ({target[r.day]})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Weeks (UTC, from Monday)</h2>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Week of</th>
                <th className="px-4 py-2 font-medium">People who trained</th>
                <th className="px-4 py-2 font-medium">Workouts</th>
                <th className="px-4 py-2 font-medium">Per person</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {m.weeks.map((w, i) => (
                <tr key={w.weekStart}>
                  <td className="px-4 py-2">
                    {w.weekStart}
                    {i === m.weeks.length - 1 && " (so far)"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{w.activeUsers}</td>
                  <td className="px-4 py-2 tabular-nums">{w.workouts}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {w.activeUsers ? (w.workouts / w.activeUsers).toFixed(1) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="On leaderboards"
          value={pct(m.onLeaderboards, m.socialProfiles)}
          note={`${m.onLeaderboards} of ${m.socialProfiles} social profiles`}
        />
        <Stat
          label="Active people in a running challenge"
          value={pct(m.inRunningChallenge, m.weeklyActive)}
          note={`${m.inRunningChallenge} of ${m.weeklyActive}`}
        />
        <Stat
          label="Challenges completed, last 30 days"
          value={String(m.challengeCompletions30d)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Syncing, last 7 days</h2>
        <p className="text-muted-foreground text-sm">
          Saves that reached the server. Conflicts are two devices disagreeing and are resolved on
          the device; failures are saves the server refused or couldn&apos;t make. Saves that never
          reached the server (no signal) aren&apos;t counted here.
        </p>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">What</th>
                <th className="px-4 py-2 font-medium">Saved</th>
                <th className="px-4 py-2 font-medium">Conflicts</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Failure rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {m.sync.length === 0 ? (
                <tr>
                  <td className="px-4 py-2" colSpan={5}>
                    No saves yet.
                  </td>
                </tr>
              ) : (
                m.sync.map((s) => (
                  <tr key={s.channel}>
                    <td className="px-4 py-2">
                      {s.channel === "workout" ? "Workouts" : "Quick logs"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{s.ok}</td>
                    <td className="px-4 py-2 tabular-nums">{s.conflicts}</td>
                    <td className="px-4 py-2 tabular-nums">{s.failed}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {pct(s.failed, s.ok + s.conflicts + s.failed)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>
      <p className="text-sm">
        <Link href="/admin/reports" className="text-accent font-medium">
          Reports and moderation
        </Link>
      </p>
    </div>
  );
}

export default function MetricsPage() {
  return (
    <>
      <PageHeader title="Beta metrics" subtitle="Counts only, never anyone's training" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Metrics />
      </Suspense>
    </>
  );
}
