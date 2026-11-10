"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser } from "lucide-react";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { isActive, navItems } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

function SidebarView({ pathname }: { pathname: string }) {
  return (
    <aside className="bg-card sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-5 md:flex">
      <Link href="/" className="px-3 text-xl font-bold tracking-tight">
        Reptr
      </Link>
      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-accent")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/profile"
        aria-current={pathname.startsWith("/profile") ? "page" : undefined}
        className={cn(
          "mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          pathname.startsWith("/profile")
            ? "bg-accent-soft text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <CircleUser className="size-5" />
        Profile and settings
      </Link>
      <ThemeToggle compact />
    </aside>
  );
}

function BottomNavView({ pathname }: { pathname: string }) {
  return (
    <nav className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-6">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActiveSidebar() {
  return <SidebarView pathname={usePathname()} />;
}

function ActiveBottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

// The current path is request data, so the nav renders without a highlight in the
// static shell and picks up the active item as soon as the path is known.
export function Sidebar() {
  return (
    <Suspense fallback={<SidebarView pathname="" />}>
      <ActiveSidebar />
    </Suspense>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView pathname="" />}>
      <ActiveBottomNav />
    </Suspense>
  );
}
