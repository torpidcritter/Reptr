import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FollowButton } from "@/components/social/follow-button";
import { PersonRow } from "@/components/social/person-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import {
  followStates,
  myProfile,
  profileByHandle,
  searchPeople,
  type ProfileCard,
} from "@/modules/social/social";

export const metadata: Metadata = { title: "Find people" };

async function Results({ q }: { q: string }) {
  const user = await requireUser();
  if (!(await myProfile(db, user.id))) redirect("/social/profile");
  if (q.trim().length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Type at least two letters of a name or handle.
      </p>
    );
  }
  const busy = await overLimit(user.id, "search");
  if (busy)
    return (
      <p role="alert" className="text-danger text-sm">
        {busy}
      </p>
    );
  const people: ProfileCard[] = [...(await searchPeople(db, user.id, q))];
  // Someone who keeps out of search can still be found by their exact handle.
  if (!people.length) {
    const exact = await profileByHandle(db, user.id, q.trim().replace(/^@/, "").toLowerCase());
    if (exact && !exact.relationship.self) people.push(exact.card);
  }
  if (!people.length) return <p className="text-muted-foreground text-sm">Nobody found.</p>;
  const states = await followStates(
    db,
    user.id,
    people.map((p) => p.userId),
  );
  const urls = await avatarUrls(people.map((p) => p.avatarPath));
  return (
    <Card>
      <ul className="flex flex-col gap-3">
        {people.map((p) => {
          return (
            <PersonRow key={p.userId} card={p} url={urls.get(p.avatarPath ?? "")}>
              <FollowButton
                userId={p.userId}
                handle={p.handle}
                isPrivate={p.visibility === "private"}
                initial={states.get(p.userId) ?? "none"}
              />
            </PersonRow>
          );
        })}
      </ul>
    </Card>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/social/search">) {
  return (
    <>
      <PageHeader title="Find people" subtitle="Search by name or handle" />
      <Suspense fallback={null}>
        <SearchBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SearchBody({
  searchParams,
}: {
  searchParams: PageProps<"/social/search">["searchParams"];
}) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 40) : "";
  return (
    <div className="flex flex-col gap-4">
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Name or handle
        </label>
        <Input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Name or @handle"
          autoComplete="off"
        />
        <Button type="submit">Search</Button>
      </form>
      {query && (
        <Suspense fallback={<p className="text-muted-foreground text-sm">Searching…</p>}>
          <Results q={query} />
        </Suspense>
      )}
    </div>
  );
}
