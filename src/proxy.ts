import { NextResponse, type NextRequest } from "next/server";
import { CREATE_PROFILE_PATH, IDENTITY_COOKIE, identityCookieOptions } from "@/lib/identity-cookie";

const PUBLIC_PATHS = [CREATE_PROFILE_PATH, "/offline", "/api/health"];

/** Local use acting as a fixed account (see lib/auth.ts): nobody needs a profile cookie. */
const devIdentity = () =>
  (process.env.NODE_ENV === "development" || process.env.REPTR_LOCAL === "1") &&
  Boolean(process.env.REPTR_DEV_USER_ID || process.env.REPTR_DEMO === "1") &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Sends visitors this browser has no profile for to "Let's create your profile.", and
 * keeps the profile cookie from expiring while the app is used. Whether the cookie is
 * valid is checked by the server on each request (lib/auth.ts), not here.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get(IDENTITY_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // End-to-end tests can opt back into the real behaviour (see lib/auth.ts).
  const e2eProfile =
    process.env.REPTR_E2E === "1" &&
    process.env.NODE_ENV === "development" &&
    request.cookies.get("reptr-e2e-user")?.value === "profile";

  if (!token && !isPublic && (e2eProfile || !devIdentity())) {
    const to = request.nextUrl.clone();
    to.pathname = CREATE_PROFILE_PATH;
    to.search = "";
    return NextResponse.redirect(to);
  }
  const response = NextResponse.next({ request });
  if (token) response.cookies.set(IDENTITY_COOKIE, token, identityCookieOptions());
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
