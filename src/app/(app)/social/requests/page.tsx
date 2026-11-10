import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PersonRow } from "@/components/social/person-row";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { requireUser } from "@/lib/auth";
import { incomingRequests } from "@/modules/social/social";
import { AnswerRequest } from "./answer";

export const metadata: Metadata = { title: "Follow requests" };

async function Requests() {
  const user = await requireUser();
  const list = await incomingRequests(db, user.id);
  if (!list.length)
    return (
      <EmptyState
        icon={Inbox}
        title="No requests"
        body="When your account is private, people ask to follow you here."
      />
    );
  const urls = await avatarUrls(list.map((r) => r.avatarPath));
  return (
    <Card>
      <ul className="flex flex-col gap-3">
        {list.map((r) => (
          <PersonRow key={r.userId} card={r} url={urls.get(r.avatarPath ?? "")}>
            <AnswerRequest requester={r.userId} handle={r.handle} />
          </PersonRow>
        ))}
      </ul>
    </Card>
  );
}

export default function RequestsPage() {
  return (
    <>
      <PageHeader title="Follow requests" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Requests />
      </Suspense>
    </>
  );
}
