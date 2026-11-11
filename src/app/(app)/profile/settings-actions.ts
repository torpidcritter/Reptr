"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/modules/ops/audit";
import { requireUser } from "@/lib/auth";
import { onboardingFromForm, onboardingSchema, restSchema } from "@/modules/profile/onboarding";

export type SettingsState = { errors?: Record<string, string[] | undefined>; saved?: boolean };

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const values = Object.fromEntries(formData);
  const parsed = onboardingSchema.safeParse(onboardingFromForm(formData));
  const rest = restSchema.safeParse(values.defaultRestSeconds);
  if (!parsed.success || !rest.success) {
    return {
      errors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(rest.success ? {} : { defaultRestSeconds: [rest.error.issues[0].message] }),
      },
    };
  }
  // Weight and age aren't on this form: weight is logged on its own, and age stays as set.
  const profile: Partial<typeof parsed.data> = { ...parsed.data };
  delete profile.weightKg;
  delete profile.dateOfBirth;
  // The name is edited with the rest of the profile (identity-actions.ts).
  delete profile.displayName;
  await db
    .update(schema.profiles)
    .set({
      ...profile,
      defaultRestSeconds: rest.data,
      trackNutrition: formData.get("trackNutrition") === "on",
      trackRecovery: formData.get("trackRecovery") === "on",
    })
    .where(eq(schema.profiles.userId, user.id));
  await audit(db, user.id, "settings_changed");
  revalidatePath("/", "layout");
  return { saved: true };
}
