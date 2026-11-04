import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/physique", label: "Physique" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/recovery", label: "Recovery" },
] as const;

/** Switches between the pages of the Body section. */
export function BodyTabs({ current }: { current: (typeof tabs)[number]["href"] }) {
  return (
    <nav className="border-border mb-6 flex gap-1 border-b" aria-label="Body">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            t.href === current
              ? "border-accent text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
