import { ChevronRight, Download } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { db } from "@/db";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { isModerator } from "@/modules/community/moderation";
import { recentAudit } from "@/modules/ops/audit";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { avatarUrls } from "@/lib/avatar-urls";
import { storageEnabled } from "@/lib/supabase/storage";
import { deleteAccountAction } from "./actions";
import { ClearDeviceButton } from "./clear-device-button";
import { clearDeviceAction } from "./identity-actions";
import { IdentityForm, ProfileKeyCard } from "./identity-form";
import { DeleteAccount } from "./delete-account";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Profile" };

const when = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
} as const;

/** The account's recent sensitive actions, so anything unexpected stands out. */
async function Activity({ userId }: { userId: string }) {
  const [rows, tz] = await Promise.all([recentAudit(db, userId, 8), getTimeZone()]);
  const fmt = new Intl.DateTimeFormat("en-GB", { ...when, timeZone: tz });
  return (
    <Card>
      <CardLabel>Account activity</CardLabel>
      {rows.length ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span>
                {r.label}
                {typeof r.detail?.format === "string" && ` (${r.detail.format.toUpperCase()})`}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {fmt.format(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">
          Profile changes, downloads and other account changes will be listed here.
        </p>
      )}
    </Card>
  );
}

async function ProfileBody() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const urls = await avatarUrls([profile?.avatarPath]);
  return (
    <>
      <PageHeader
        title={profile?.displayName ?? "Profile"}
        subtitle={profile?.username ? `@${profile.username}` : undefined}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4" id="your-profile">
            <CardLabel>Your profile</CardLabel>
            <AvatarPicker
              name={profile?.displayName ?? null}
              handle={profile?.username ?? "?"}
              url={urls.get(profile?.avatarPath ?? "") ?? null}
              enabled={storageEnabled()}
            />
            <IdentityForm
              initial={{
                displayName: profile?.displayName ?? "",
                username: profile?.username ?? "",
                contactEmail: profile?.contactEmail ?? "",
                bio: profile?.bio ?? "",
              }}
            />
          </Card>
          <Card>
            <CardLabel>Training settings</CardLabel>
            <div className="mt-3">
              {profile && (
                <SettingsForm
                  profile={{
                    displayName: profile.displayName,
                    unitSystem: profile.unitSystem,
                    heightCm: profile.heightCm,
                    goal: profile.goal,
                    experience: profile.experience,
                    trainingDays: profile.trainingDays,
                    equipment: profile.equipment,
                    trackNutrition: profile.trackNutrition,
                    trackRecovery: profile.trackRecovery,
                    defaultRestSeconds: profile.defaultRestSeconds,
                  }}
                />
              )}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardLabel>More</CardLabel>
            <nav aria-label="More" className="mt-2 flex flex-col">
              {[
                ...(profile?.trackNutrition ? [{ href: "/nutrition", label: "Nutrition" }] : []),
                ...(profile?.trackRecovery ? [{ href: "/recovery", label: "Recovery" }] : []),
                { href: "/physique", label: "Body and weight" },
                { href: "/achievements", label: "Level, badges and achievements" },
                { href: "/social/profile", label: "Social profile and privacy" },
                { href: "/notifications", label: "Notifications" },
                { href: "/timeline", label: "Timeline" },
                ...(isModerator(user.id)
                  ? [
                      { href: "/admin/reports", label: "Reports to review" },
                      { href: "/admin/metrics", label: "Beta metrics" },
                    ]
                  : []),
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="hover:bg-muted -mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 text-sm font-medium"
                >
                  {l.label}
                  <ChevronRight className="text-muted-foreground size-4" />
                </Link>
              ))}
            </nav>
          </Card>
          <Card>
            <CardLabel>Appearance</CardLabel>
            <ThemeToggle className="mt-3" />
          </Card>
          <Card>
            <CardLabel>Your data</CardLabel>
            <p className="text-muted-foreground mt-2 text-sm">
              Download everything you&apos;ve logged. It&apos;s yours.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="/profile/export?format=json"
                className={buttonVariants({ variant: "outline" })}
                download
              >
                <Download /> Everything (JSON)
              </a>
              {(
                [
                  ["sets", "All sets"],
                  ["body", "Weigh-ins and measurements"],
                  ["food", "Food log"],
                  ["checkins", "Recovery check-ins"],
                ] as const
              ).map(([table, label]) => (
                <a
                  key={table}
                  href={`/profile/export?format=csv&table=${table}`}
                  className={buttonVariants({ variant: "outline" })}
                  download
                >
                  <Download /> {label} (CSV)
                </a>
              ))}
            </div>
          </Card>
          <Suspense fallback={null}>
            <Activity userId={user.id} />
          </Suspense>
          <Card className="flex flex-col gap-3">
            <CardLabel>Profile key</CardLabel>
            <ProfileKeyCard />
          </Card>
          <ClearDeviceButton clearDevice={clearDeviceAction} />
          <Card>
            <DeleteAccount deleteAccountAction={deleteAccountAction} />
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageHeader title="Profile" />}>
      <ProfileBody />
    </Suspense>
  );
}
