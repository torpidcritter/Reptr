// The cookie that says which profile this browser is. Shared by the proxy (which only
// checks it's there) and the server (which looks it up). See modules/profile/identity.ts.

export const IDENTITY_COOKIE = "reptr-id";

/** Browsers cap cookie lifetimes at 400 days; the proxy renews it on every visit. */
export const IDENTITY_MAX_AGE = 400 * 24 * 3600;

export const identityCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: IDENTITY_MAX_AGE,
});

/** The page for anyone this browser doesn't know yet. */
export const CREATE_PROFILE_PATH = "/create-profile";

/** Set for a few minutes after a profile is made, so its success screen stays up. */
export const JUST_CREATED_COOKIE = "reptr-new-profile";
