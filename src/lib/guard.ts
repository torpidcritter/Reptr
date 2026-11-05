import "server-only";
import { db } from "@/db";
import { log } from "@/lib/log";
import { hit, type LimitName, waitText } from "@/modules/ops/rate-limit";

/**
 * Counts a call against one or more limits. Returns null when it may go ahead, or a
 * message to show the user when they've hit a limit.
 */
export async function overLimit(subject: string, ...names: LimitName[]) {
  for (const name of names) {
    const r = await hit(db, name, subject);
    if (!r.ok) {
      log.warn("rate_limited", { limit: name, retryAfterSec: r.retryAfterSec });
      return `You're doing that a lot. Try again ${waitText(r.retryAfterSec)}.`;
    }
  }
  return null;
}
