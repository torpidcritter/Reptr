import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { viewerUnreadCount } from "@/app/(app)/unread-count";

function BellLink({ count }: { count: number }) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="text-muted-foreground hover:text-foreground relative -mr-2 flex size-10 items-center justify-center rounded-full"
    >
      <Bell className="size-6" />
      {count > 0 && (
        <span
          aria-hidden
          className="bg-accent text-accent-foreground absolute top-1 right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

async function Count() {
  return <BellLink count={await viewerUnreadCount()} />;
}

/** Bell with the number of unread notifications, in each page's header. */
export function NotificationBell() {
  return (
    <Suspense fallback={<BellLink count={0} />}>
      <Count />
    </Suspense>
  );
}
