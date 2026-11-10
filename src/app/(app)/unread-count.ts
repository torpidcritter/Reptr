import "server-only";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/log";
import { unreadCount } from "@/modules/community/notifications";

/**
 * Unread notifications for the signed-in person, for the bell in every page header.
 * A failure shows a plain bell rather than breaking the page around it.
 */
export async function viewerUnreadCount() {
  const user = await requireUser();
  try {
    return await unreadCount(db, user.id);
  } catch (err) {
    log.error("unread_count_failed", { err });
    return 0;
  }
}
