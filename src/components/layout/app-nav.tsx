"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, navItems } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

export function Sidebar() {
  const pathname = usePathname();
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
      <ThemeToggle compact />
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
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
