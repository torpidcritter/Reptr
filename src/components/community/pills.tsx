import Link from "next/link";
import { cn } from "@/lib/utils";

/** A row of links that act as a single choice (the current one is marked). */
export function Pills({
  label,
  options,
}: {
  label: string;
  options: { href: string; label: string; current: boolean }[];
}) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.current ? "true" : undefined}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            o.current
              ? "bg-foreground text-background border-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
