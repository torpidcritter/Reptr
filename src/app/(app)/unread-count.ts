import "server-only";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/modules/community/notifications";

/** Unread notifications for the signed-in person, for the bell in page headers. */
export async function viewerUnreadCount() {
  const user = await requireUser();
  return unreadCount(db, user.id);
}
