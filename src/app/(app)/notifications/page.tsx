import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/social/avatar";
import { Card, CardLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { avatarUrls } from "@/lib/avatar-urls";
import { getTimeZone, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getNotificationSettings,
  listNotifications,
  pruneNotifications,
} from "@/modules/community/notifications";
import { pushConfigured } from "@/modules/community/push";
import { MarkRead, NotificationSettings } from "./notification-settings";

export const metadata: Metadata = { title: "Notifications" };

async function Notifications() {
  const user = await requireUser();
  await pruneNotifications(db, user.id).catch(() => {});
  const [{ items }, settings, tz] = await Promise.all([
    listNotifications(db, user.id),
    getNotificationSettings(db, user.id),
    getTimeZone(),
  ]);
  const urls = await avatarUrls(items.map((n) => n.actor?.avatarPath ?? null));
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="flex flex-col gap-6">
      <MarkRead unread={unread} />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing yet"
          body="Follows, likes, comments, badges and finished challenges show up here."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className={cn(
                    "hover:bg-muted flex items-center gap-3 px-4 py-3 transition-colors",
                    !n.read && "bg-accent-soft",
                  )}
                >
                  {n.actor ? (
                    <Avatar
                      name={n.actor.displayName}
                      handle={n.actor.handle}
                      url={urls.get(n.actor.avatarPath ?? "")}
                      size="sm"
                    />
                  ) : (
                    <span className="bg-accent-soft flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Bell className="text-accent size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      {!n.read && <span className="sr-only">New: </span>}
                      {n.text}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {formatDate(n.createdAt, tz, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <CardLabel>Settings</CardLabel>
        <NotificationSettings
          initial={settings}
          pushKey={pushConfigured() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY! : null}
        />
      </Card>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Notifications />
      </Suspense>
    </>
  );
}
