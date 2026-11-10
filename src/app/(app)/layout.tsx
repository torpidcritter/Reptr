import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountScope } from "@/components/layout/account-scope";
import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { DeviceAlerts } from "@/components/layout/device-alerts";
import { OutboxSyncer } from "@/components/layout/outbox-syncer";
import { TimezoneCookie } from "@/components/layout/timezone-cookie";
import { ActiveWorkoutPill } from "@/components/workout/active-workout-pill";
import { WorkoutSyncer } from "@/components/workout/workout-syncer";
import { getProfile, requireUser } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo";

/** Sends signed-in users who haven't set up their profile to onboarding. The proxy handles signed-out visitors. */
async function OnboardingGate() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.onboardedAt) redirect("/onboarding");
  return null;
}

/** Points this device's stores at the signed-in account (see lib/device/scope.ts). */
async function DeviceAccount() {
  const user = await requireUser();
  return <AccountScope userId={user.id} />;
}

/** Makes it obvious when the screens show the sample account rather than real training. */
async function DemoBanner() {
  const user = await requireUser();
  if (!isDemoUser(user.id)) return null;
  return (
    <p className="bg-accent-soft text-foreground mb-4 rounded-xl px-4 py-2 text-sm">
      <span className="font-semibold">Demo account.</span> Everything here is sample data, not your
      own training.
    </p>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGate />
      </Suspense>
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-10 md:pb-10">
          <Suspense fallback={null}>
            <DemoBanner />
          </Suspense>
          <DeviceAlerts />
          {children}
        </main>
      </div>
      <BottomNav />
      <Suspense fallback={null}>
        <DeviceAccount />
      </Suspense>
      <WorkoutSyncer />
      <OutboxSyncer />
      <TimezoneCookie />
      <Suspense fallback={null}>
        <ActiveWorkoutPill />
      </Suspense>
    </>
  );
}
