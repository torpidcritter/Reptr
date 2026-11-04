import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "bg-background placeholder:text-muted-foreground focus-visible:ring-ring aria-invalid:border-danger h-12 w-full rounded-xl border px-3 text-base outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "bg-background focus-visible:ring-ring h-12 w-full rounded-xl border px-3 text-base outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
