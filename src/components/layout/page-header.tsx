import type { ReactNode } from "react";
import { NotificationBell } from "./notification-bell";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <NotificationBell />
      </div>
    </header>
  );
}
