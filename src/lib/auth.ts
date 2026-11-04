import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The signed-in user, verified with Supabase Auth. Cached per request. */
export const getUser = cache(async () => {
  const devUser = localDevUser();
  if (devUser) return devUser;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export const getProfile = cache(async (userId: string) => {
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  return profile ?? null;
});

/**
 * Local development without Supabase: set REPTR_DEV_USER_ID (and leave the Supabase
 * variables unset) to act as that user. Ignored outside `next dev`.
 */
function localDevUser() {
  const id = process.env.REPTR_DEV_USER_ID;
  if (process.env.NODE_ENV !== "development" || !id || process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  return { id, email: "dev@localhost" } as Awaited<
    ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>["auth"]["getUser"]>
  >["data"]["user"];
}

/** The user's time zone from the device, or UTC until the browser has reported it. */
export async function getTimeZone() {
  const { cookies } = await import("next/headers");
  const tz = (await cookies()).get("tz")?.value;
  if (tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return tz;
    } catch {}
  }
  return "UTC";
}
