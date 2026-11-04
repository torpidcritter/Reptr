import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { TimezoneCookie } from "@/components/layout/timezone-cookie";
import { ActiveWorkoutPill } from "@/components/workout/active-workout-pill";
import { WorkoutSyncer } from "@/components/workout/workout-syncer";
import { getProfile, requireUser } from "@/lib/auth";

/** Sends signed-in users who haven't set up their profile to onboarding. The proxy handles signed-out visitors. */
async function OnboardingGate() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.onboardedAt) redirect("/onboarding");
  return null;
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
          {children}
        </main>
      </div>
      <BottomNav />
      <WorkoutSyncer />
      <TimezoneCookie />
      <Suspense fallback={null}>
        <ActiveWorkoutPill />
      </Suspense>
    </>
  );
}
