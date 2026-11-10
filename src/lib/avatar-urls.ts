import "server-only";
import { log } from "@/lib/log";
import { signedUrls } from "@/lib/supabase/storage";
import { avatarBucket } from "@/modules/social/avatars";

/**
 * Short-lived links to profile pictures, for cards the viewer is already allowed to see.
 * If storage is unavailable the cards show initials instead.
 */
export async function avatarUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  try {
    return await signedUrls(avatarBucket, unique, 3600);
  } catch (err) {
    log.warn("avatar_links_failed", { err });
    return new Map<string, string>();
  }
}
