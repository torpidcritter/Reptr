import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PostCard } from "@/components/social/post-card";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getPost } from "@/modules/social/social";
import { Comments } from "./comments";

export const metadata: Metadata = { title: "Post" };

async function Post({ params }: { params: PageProps<"/social/post/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const found = await getPost(db, user.id, id);
  if (!found) notFound();
  const [profile, tz] = await Promise.all([getProfile(user.id), getTimeZone()]);
  const urls = await avatarUrls([
    found.post.author.avatarPath,
    ...found.comments.map((c) => c.author.avatarPath),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PostCard
        post={found.post}
        units={profile?.unitSystem ?? "metric"}
        timeZone={tz}
        avatarUrl={urls.get(found.post.author.avatarPath ?? "")}
        me={user.id}
        linkToPost={false}
      />
      <Card>
        <Comments
          postId={found.post.id}
          isAuthor={found.isAuthor}
          items={found.comments.map((c) => ({
            id: c.id,
            parentId: c.parentId,
            body: c.body,
            mine: c.mine,
            when: formatDate(c.createdAt, tz, { hour: "2-digit", minute: "2-digit" }),
            author: {
              userId: c.author.userId,
              handle: c.author.handle,
              displayName: c.author.displayName,
              avatarUrl: urls.get(c.author.avatarPath ?? "") ?? null,
            },
          }))}
        />
      </Card>
    </div>
  );
}

export default function PostPage({ params }: PageProps<"/social/post/[id]">) {
  return (
    <>
      <PageHeader title="Post" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Post params={params} />
      </Suspense>
    </>
  );
}
