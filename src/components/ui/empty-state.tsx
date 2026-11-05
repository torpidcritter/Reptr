import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** What a screen shows before there's any data: what will appear, and the one action that starts it. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="bg-accent-soft flex size-12 items-center justify-center rounded-full">
        <Icon className="text-accent size-6" />
      </div>
      <p className="font-semibold">{title}</p>
      {body && <p className="text-muted-foreground max-w-sm text-sm text-balance">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
