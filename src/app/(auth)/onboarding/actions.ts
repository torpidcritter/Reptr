"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getTimeZone, requireUser } from "@/lib/auth";
import { logEntry } from "@/modules/body/body";
import { onboardingFromForm, onboardingSchema } from "@/modules/profile/onboarding";

export type OnboardingState = { errors?: Record<string, string[] | undefined> };

type ProfileValues = Omit<Partial<typeof schema.profiles.$inferInsert>, "userId">;

async function saveProfile(userId: string, values: ProfileValues) {
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
  const parsed = onboardingSchema.safeParse(onboardingFromForm(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { weightKg, ...profile } = parsed.data;
  await saveProfile(user.id, profile);
  // The weight they gave becomes their first weigh-in, dated today where they are.
  if (weightKg) {
    const tz = await getTimeZone();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    await logEntry(db, user.id, { day, values: { weight: weightKg }, bodyFatMethod: null }, tz);
  }
  redirect("/");
}

export async function skipOnboarding() {
  const user = await requireUser();
  await saveProfile(user.id, {});
  redirect("/");
}
