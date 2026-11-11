import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountScope } from "@/components/layout/account-scope";
import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { DeviceAlerts } from "@/components/layout/device-alerts";
import { OutboxSyncer } from "@/components/layout/outbox-syncer";
import { ProfileCookieRenewer } from "@/components/layout/profile-cookie-renewer";
import { TimezoneCookie } from "@/components/layout/timezone-cookie";
import { ActiveWorkoutPill } from "@/components/workout/active-workout-pill";
import { WorkoutSyncer } from "@/components/workout/workout-syncer";
import { db } from "@/db";
import { getProfile, requireUser } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo";
import { CREATE_PROFILE_PATH } from "@/lib/identity-cookie";
import { log } from "@/lib/log";
import { deviceKey } from "@/modules/sync/device-key";

/**
 * A profile without a username (made before profiles had one) finishes it first, then
 * anyone not set up yet goes to onboarding. Browsers without a profile were already
 * sent to create one by the proxy.
 */
async function OnboardingGate() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.username) redirect(CREATE_PROFILE_PATH);
  if (!profile.onboardedAt) redirect("/onboarding");
  return null;
}

/** Points this device's stores at the signed-in account (see lib/device/scope.ts). */
async function DeviceAccount() {
  const user = await requireUser();
  // A key that can't be fetched must never stop the app from loading: the device then
  // keeps what it already has and doesn't touch anything stored encrypted.
  const key = await deviceKey(db, user.id).catch((err: unknown) => {
    log.error("device_key_failed", { err });
    return undefined;
  });
  return <AccountScope userId={user.id} deviceKey={key} />;
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
      <ProfileCookieRenewer />
      <Suspense fallback={null}>
        <ActiveWorkoutPill />
      </Suspense>
    </>
  );
}
