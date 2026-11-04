import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Profile" };

async function ProfileHeader() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return <PageHeader title={profile?.displayName ?? "Profile"} subtitle={user.email} />;
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<PageHeader title="Profile" />}>
        <ProfileHeader />
      </Suspense>
      <div className="flex max-w-md flex-col gap-4">
        <Card>
          <CardLabel>Appearance</CardLabel>
          <ThemeToggle className="mt-3" />
        </Card>
        <form action={signOut}>
          <Button variant="outline" className="w-full">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
    </>
  );
}
