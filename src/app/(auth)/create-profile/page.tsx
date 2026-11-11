import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getProfile, getUser } from "@/lib/auth";
import { JUST_CREATED_COOKIE } from "@/lib/identity-cookie";
import { CreateProfileForm, OpenProfileForm } from "./create-profile-form";

export const metadata: Metadata = { title: "Create your profile", robots: { index: false } };

/**
 * New here: create a profile. Already a profile on this browser: straight to the app.
 * An account from before profiles (no username yet) finishes its profile here.
 */
async function Body() {
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  const justCreated = (await cookies()).has(JUST_CREATED_COOKIE);
  if (profile?.username && !justCreated) redirect("/");
  const finishing = Boolean(user) && !justCreated;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        {finishing ? "Finish your profile." : "Let’s create your profile."}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        {finishing
          ? "Pick a username so your profile is complete. Your training stays as it is."
          : "No passwords, no emails to confirm. This takes a few seconds."}
      </p>
      <CreateProfileForm
        finishing={finishing}
        initial={{ displayName: justCreated ? "" : (profile?.displayName ?? "") }}
      />
      {!finishing && !justCreated && (
        <div className="mt-6">
          <OpenProfileForm />
        </div>
      )}
    </>
  );
}

export default function CreateProfilePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
      <Body />
    </Suspense>
  );
}
