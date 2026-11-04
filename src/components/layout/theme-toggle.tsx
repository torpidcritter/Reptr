"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribe = () => () => {};

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser, so render neutral on the server.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("bg-muted grid grid-cols-3 gap-1 rounded-xl p-1", className)}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
              selected ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
