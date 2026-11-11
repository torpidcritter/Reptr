import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, requireUser } from "@/lib/auth";
import { blockedPeople, myProfile } from "@/modules/social/social";
import { BlockedList } from "./blocked-list";
import { LeaveSocial } from "./leave-social";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Social profile" };

async function Settings() {
  const user = await requireUser();
  const [mine, profile, blocked] = await Promise.all([
    myProfile(db, user.id),
    getProfile(user.id),
    blockedPeople(db, user.id),
  ]);
  const urls = await avatarUrls([profile?.avatarPath]);
  const username = profile?.username ?? mine?.handle ?? "";
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <Avatar
          name={profile?.displayName ?? null}
          handle={username}
          url={urls.get(profile?.avatarPath ?? "") ?? null}
          size="lg"
        />
        <div className="min-w-0">
          <p className="font-semibold">{profile?.displayName}</p>
          <p className="text-muted-foreground">@{username}</p>
          {profile?.bio && <p className="mt-1 text-sm">{profile.bio}</p>}
          <Link href="/profile#your-profile" className="text-accent mt-1 inline-block text-sm">
            Edit name, username, bio or picture
          </Link>
        </div>
      </Card>
      <Card>
        <ProfileForm
          isNew={!mine}
          initial={{
            handle: username,
            bio: profile?.bio ?? "",
            visibility: mine?.visibility ?? "private",
            discoverable: mine?.discoverable ?? true,
            leaderboards: mine?.leaderboards ?? true,
          }}
        />
      </Card>
      {mine && (
        <>
          <Card className="flex flex-col gap-3">
            <CardLabel>Blocked</CardLabel>
            <BlockedList people={blocked} />
          </Card>
          <Card className="flex flex-col gap-3">
            <CardLabel>Leave</CardLabel>
            <LeaveSocial />
          </Card>
        </>
      )}
    </div>
  );
}

export default function SocialProfilePage() {
  return (
    <>
      <PageHeader title="Social profile" subtitle="How other people see you" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Settings />
      </Suspense>
    </>
  );
}
