import { CircleUser } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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
        {/* Phones have no sidebar, so profile and settings sit here instead of a sixth tab. */}
        <Link
          href="/profile"
          aria-label="Profile and settings"
          className="text-muted-foreground hover:text-foreground -mr-2 flex size-10 items-center justify-center rounded-full md:hidden"
        >
          <CircleUser className="size-6" />
        </Link>
      </div>
    </header>
  );
}
