import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getProfile, requireUser } from "@/lib/auth";
import { storageEnabled } from "@/lib/supabase/storage";
import { blockedPeople, myProfile } from "@/modules/social/social";
import { AvatarPicker } from "./avatar-picker";
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
  const urls = await avatarUrls([mine?.avatarPath]);
  return (
    <div className="flex flex-col gap-4">
      {mine && (
        <Card>
          <AvatarPicker
            userId={user.id}
            name={profile?.displayName ?? null}
            handle={mine.handle}
            url={urls.get(mine.avatarPath ?? "") ?? null}
            enabled={storageEnabled()}
          />
        </Card>
      )}
      <Card>
        <ProfileForm
          isNew={!mine}
          initial={{
            handle: mine?.handle ?? "",
            bio: mine?.bio ?? "",
            visibility: mine?.visibility ?? "private",
            discoverable: mine?.discoverable ?? true,
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
