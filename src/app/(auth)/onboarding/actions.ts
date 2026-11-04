"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { onboardingSchema, type OnboardingInput } from "@/modules/profile/onboarding";

export type OnboardingState = { errors?: Record<string, string[] | undefined> };

async function saveProfile(userId: string, values: Partial<OnboardingInput>) {
  const row = { ...values, onboardedAt: new Date() };
  await db
    .insert(schema.profiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: row });
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  await saveProfile(user.id, parsed.data);
  redirect("/");
}

export async function skipOnboarding() {
  const user = await requireUser();
  await saveProfile(user.id, {});
  redirect("/");
}
