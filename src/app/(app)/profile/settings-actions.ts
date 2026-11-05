"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/modules/ops/audit";
import { requireUser } from "@/lib/auth";
import { onboardingSchema, restSchema } from "@/modules/profile/onboarding";

export type SettingsState = { errors?: Record<string, string[] | undefined>; saved?: boolean };

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const values = Object.fromEntries(formData);
  const parsed = onboardingSchema.safeParse(values);
  const rest = restSchema.safeParse(values.defaultRestSeconds);
  if (!parsed.success || !rest.success) {
    return {
      errors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(rest.success ? {} : { defaultRestSeconds: [rest.error.issues[0].message] }),
      },
    };
  }
  await db
    .update(schema.profiles)
    .set({ ...parsed.data, defaultRestSeconds: rest.data })
    .where(eq(schema.profiles.userId, user.id));
  await audit(db, user.id, "settings_changed");
  revalidatePath("/", "layout");
  return { saved: true };
}
