import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card bg-card text-card-foreground border p-4 shadow-xs", className)}
      {...props}
    />
  );
}

export function CardLabel({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-muted-foreground text-xs font-medium tracking-wide uppercase", className)}
      {...props}
    />
  );
}

export function CardValue({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-1 text-2xl font-semibold tabular-nums", className)} {...props} />;
}
