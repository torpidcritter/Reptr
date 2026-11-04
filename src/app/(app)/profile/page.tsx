import { Download, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth";
import { signOut } from "./actions";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Profile" };

async function ProfileBody() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return (
    <>
      <PageHeader title={profile?.displayName ?? "Profile"} subtitle={user.email} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                  trainingDaysPerWeek: profile.trainingDaysPerWeek,
                  defaultRestSeconds: profile.defaultRestSeconds,
                }}
              />
            )}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
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
              <a
                href="/profile/export?format=csv"
                className={buttonVariants({ variant: "outline" })}
                download
              >
                <Download /> All sets (CSV for spreadsheets)
              </a>
            </div>
          </Card>
          <form action={signOut}>
            <Button variant="outline" className="w-full">
              <LogOut /> Sign out
            </Button>
          </form>
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
