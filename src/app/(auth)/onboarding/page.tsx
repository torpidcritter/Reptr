import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up" };

/** Already set up? Go straight to the app. */
async function AlreadyOnboarded() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile?.onboardedAt) redirect("/");
  return null;
}

export default function OnboardingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <AlreadyOnboarded />
      </Suspense>
      <h1 className="text-2xl font-semibold tracking-tight">Set up Reptr</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        A few basics so your numbers show up right. You can change these later.
      </p>
      <Card className="p-5">
        <OnboardingForm />
      </Card>
    </>
  );
}
