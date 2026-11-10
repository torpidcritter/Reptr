// The app's own public address, used for links that leave the app (sign-in emails) and
// for redirects after them. It comes from configuration, never from request headers,
// which a client can set to anything.

const DEV_FALLBACK = "http://localhost:3000";

export class SiteUrlError extends Error {}

/** Reads and checks the configured address. Exported for tests. */
export function resolveSiteUrl(env: Record<string, string | undefined>): string {
  const configured =
    env.NEXT_PUBLIC_SITE_URL ||
    // Set by Vercel on every deployment: the project's production domain, no scheme.
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const production = env.NODE_ENV === "production" && env.REPTR_LOCAL !== "1";
  if (!configured) {
    if (production) throw new SiteUrlError("NEXT_PUBLIC_SITE_URL must be set in production.");
    return DEV_FALLBACK;
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new SiteUrlError(`NEXT_PUBLIC_SITE_URL is not a valid URL: ${configured}`);
  }
  if (production && url.protocol !== "https:") {
    throw new SiteUrlError("NEXT_PUBLIC_SITE_URL must use https in production.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new SiteUrlError("NEXT_PUBLIC_SITE_URL must be an origin only, like https://reptr.app");
  }
  return url.origin;
}

export const siteUrl = () => resolveSiteUrl(process.env);

/**
 * Where to send someone after signing in. Only paths inside the app are allowed, so a
 * crafted link can't bounce a fresh session to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  try {
    const url = new URL(next, "http://x");
    if (url.origin !== "http://x") return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
