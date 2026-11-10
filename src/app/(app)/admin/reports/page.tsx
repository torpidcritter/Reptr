import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { getTimeZone, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  activityFlags,
  isModerator,
  openReports,
  sanctionedAccounts,
  type ActivityFlag,
} from "@/modules/community/moderation";
import { AccountActions } from "./account-actions";
import { Decide } from "./decide";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

function Snapshot({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  if (!snapshot) return null;
  const s = snapshot as {
    comment?: string;
    caption?: string | null;
    summary?: { name?: string; volumeKg?: number; workingSets?: number };
    profile?: { handle?: string; bio?: string | null } | null;
  };
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-lg p-3 text-sm">
      {s.comment && <p>Comment: “{s.comment}”</p>}
      {s.caption && <p>Caption: “{s.caption}”</p>}
      {s.summary && (
        <p>
          Workout: {s.summary.name} · {s.summary.workingSets} sets ·{" "}
          {Math.round(s.summary.volumeKg ?? 0).toLocaleString("en")} kg
        </p>
      )}
      {s.profile?.bio && <p>Bio: “{s.profile.bio}”</p>}
    </div>
  );
}

async function Queue() {
  const user = await requireUser();
  // The page doesn't exist for anyone else.
  if (!isModerator(user.id)) notFound();
  const [items, tz] = await Promise.all([openReports(db, user.id), getTimeZone()]);
  if (items.length === 0) {
    return <EmptyState icon={ShieldCheck} title="All clear" body="No open reports." />;
  }
  return (
    <ul aria-label="Open reports" className="flex flex-col gap-3">
      {items.map((r) => (
        <li key={r.id}>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {r.reason.replace(/_/g, " ")} ·{" "}
                {r.targetHandle ? (
                  <Link href={`/u/${r.targetHandle}`} className="text-accent">
                    @{r.targetHandle}
                  </Link>
                ) : (
                  "account gone"
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDate(r.createdAt, tz, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {r.reportsAgainstTarget} {r.reportsAgainstTarget === 1 ? "report" : "reports"} in
                total
                {r.sanction.suspended && " · suspended"}
                {r.sanction.excluded && " · off boards"}
              </p>
            </div>
            {r.details && <p className="text-sm">“{r.details}”</p>}
            <Snapshot snapshot={r.snapshot} />
            <Decide
              reportId={r.id}
              hasPost={Boolean(r.postId)}
              hasComment={Boolean(r.commentId)}
              suspended={r.sanction.suspended}
              excluded={r.sanction.excluded}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}

const flagText: Record<ActivityFlag["kind"], (v: number) => string> = {
  many_workouts: (v) => `${v} counted workouts in the last 7 days`,
  volume_spike: (v) =>
    `${v.toLocaleString("en")} kg in the last 7 days, over 3 times their usual week`,
  strength_jump: (v) => `Best lift up ${v}% on their previous best, in the last 14 days`,
};

/** Training that jumps far beyond the person's own history. A prompt to look, not a verdict. */
async function Flags() {
  const user = await requireUser();
  if (!isModerator(user.id)) return null;
  const flags = await activityFlags(db, user.id);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Unusual activity</h2>
      <p className="text-muted-foreground text-sm">
        Counted training that is far beyond the person&apos;s own history, from people on
        leaderboards or in challenges. Look before acting: a real breakthrough looks the same.
      </p>
      {flags.length === 0 ? (
        <p className="text-sm">Nothing unusual in the last two weeks.</p>
      ) : (
        <ul aria-label="Unusual activity" className="flex flex-col gap-2">
          {flags.map((f) => (
            <li key={`${f.userId}-${f.kind}`}>
              <Card className="flex flex-col gap-2 text-sm">
                <p>
                  <Link href={`/u/${f.handle}`} className="text-accent font-semibold">
                    @{f.handle}
                  </Link>{" "}
                  · {flagText[f.kind](f.value)}
                  {f.excluded && " · already off boards"}
                </p>
                {!f.excluded && (
                  <AccountActions
                    userId={f.userId}
                    handle={f.handle}
                    actions={[["exclude_leaderboards", "Keep off boards"]]}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Everyone currently suspended or kept off boards, so a decision can be lifted. */
async function Sanctions() {
  const user = await requireUser();
  if (!isModerator(user.id)) return null;
  const [rows, tz] = await Promise.all([sanctionedAccounts(db, user.id), getTimeZone()]);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Suspended or off boards</h2>
      {rows.length === 0 ? (
        <p className="text-sm">Nobody.</p>
      ) : (
        <ul aria-label="Sanctions" className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.userId}>
              <Card className="flex flex-col gap-2 text-sm">
                <p>
                  {r.handle ? (
                    <Link href={`/u/${r.handle}`} className="text-accent font-semibold">
                      @{r.handle}
                    </Link>
                  ) : (
                    "Account without a profile"
                  )}{" "}
                  ·{" "}
                  {[r.suspended && "suspended", r.excluded && "off boards"]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  · {formatDate(r.updatedAt, tz)}
                  {r.reason && ` · “${r.reason}”`}
                </p>
                <AccountActions
                  userId={r.userId}
                  handle={r.handle}
                  actions={[
                    ...(r.suspended ? ([["unsuspend", "Lift suspension"]] as const) : []),
                    ...(r.excluded
                      ? ([["include_leaderboards", "Put back on boards"]] as const)
                      : []),
                  ]}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const loading = <p className="text-muted-foreground text-sm">Loading…</p>;
  return (
    <>
      <PageHeader title="Reports" subtitle="Moderation queue, oldest first" />
      <div className="flex flex-col gap-8">
        <Suspense fallback={loading}>
          <Queue />
        </Suspense>
        <Suspense fallback={loading}>
          <Flags />
        </Suspense>
        <Suspense fallback={loading}>
          <Sanctions />
        </Suspense>
        <p className="text-sm">
          <Link href="/admin/metrics" className="text-accent font-medium">
            Beta metrics
          </Link>
        </p>
      </div>
    </>
  );
}
