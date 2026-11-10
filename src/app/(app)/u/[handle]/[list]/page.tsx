import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FollowButton } from "@/components/social/follow-button";
import { PersonRow } from "@/components/social/person-row";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { requireUser } from "@/lib/auth";
import { connections, followStates, profileByHandle } from "@/modules/social/social";

export const metadata: Metadata = { title: "Connections" };

async function List({ params }: { params: PageProps<"/u/[handle]/[list]">["params"] }) {
  const { handle, list } = await params;
  if (list !== "followers" && list !== "following") notFound();
  const user = await requireUser();
  const found = await profileByHandle(db, user.id, decodeURIComponent(handle));
  if (!found || !found.relationship.canSee) notFound();
  const people = await connections(db, user.id, found.card.userId, list);
  const [urls, states] = await Promise.all([
    avatarUrls(people.map((p) => p.avatarPath)),
    followStates(
      db,
      user.id,
      people.map((p) => p.userId),
    ),
  ]);
  return (
    <>
      <PageHeader
        title={`@${found.card.handle}`}
        subtitle={list === "followers" ? "Followers" : "Following"}
      />
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody yet.</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-3">
            {people.map((p) => (
              <PersonRow key={p.userId} card={p} url={urls.get(p.avatarPath ?? "")}>
                {p.userId !== user.id && (
                  <FollowButton
                    userId={p.userId}
                    handle={p.handle}
                    isPrivate={p.visibility === "private"}
                    initial={states.get(p.userId) ?? "none"}
                  />
                )}
              </PersonRow>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function ListPage({ params }: PageProps<"/u/[handle]/[list]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
      <List params={params} />
    </Suspense>
  );
}
