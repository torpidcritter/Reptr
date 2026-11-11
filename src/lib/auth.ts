import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { userForToken } from "@/modules/profile/identity";
import { DEMO_USER_ID } from "./demo";
import { CREATE_PROFILE_PATH, IDENTITY_COOKIE } from "./identity-cookie";

/** Whose profile this request is for. There are no passwords or sign-in emails. */
export type AppUser = { id: string };

/**
 * The profile this browser belongs to, from its identity cookie (set when the profile
 * was created here, or opened with its profile key). Cached per request.
 */
export const getUser = cache(async (): Promise<AppUser | null> => {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const e2e = await e2eUser();
  // "profile" lets an end-to-end test use the real cookie, as a visitor would.
  if (e2e !== "profile") {
    const devUser = e2e ?? localDevUser();
    if (devUser) return devUser;
  }
  const token = jar.get(IDENTITY_COOKIE)?.value;
  const id = await userForToken(db, token);
  return id ? { id } : null;
});

/** The current profile, or off to create one. Never a sign-in page. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect(CREATE_PROFILE_PATH);
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
 * Local use without Supabase: set REPTR_DEV_USER_ID (and leave the Supabase variables
 * unset) to act as that user, or REPTR_DEMO=1 to look around the sample account.
 * Ignored when Supabase is configured, and outside development unless REPTR_LOCAL=1
 * (the laptop install runs a production build on the owner's own machine).
 */
function localDevUser(): AppUser | null {
  const id = process.env.REPTR_DEMO === "1" ? DEMO_USER_ID : process.env.REPTR_DEV_USER_ID;
  const local = process.env.NODE_ENV === "development" || process.env.REPTR_LOCAL === "1";
  if (!local || !id || process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  return { id };
}

/**
 * End-to-end tests only (REPTR_E2E=1 in dev mode): a test can act as another local user
 * through a cookie, to cover a brand-new account or check two users can't see each other.
 */
async function e2eUser(): Promise<AppUser | "profile" | null> {
  if (process.env.REPTR_E2E !== "1" || process.env.NODE_ENV !== "development") return null;
  const { cookies } = await import("next/headers");
  const id = (await cookies()).get("reptr-e2e-user")?.value;
  if (id === "profile") return "profile";
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { id };
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
