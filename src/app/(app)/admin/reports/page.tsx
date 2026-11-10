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
import { isModerator, openReports } from "@/modules/community/moderation";
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
    <ul className="flex flex-col gap-3">
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

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Moderation queue, oldest first" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Queue />
      </Suspense>
    </>
  );
}
