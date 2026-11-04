import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="bg-accent-soft flex size-12 items-center justify-center rounded-full">
        <Icon className="text-accent size-6" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm text-balance">{body}</p>
    </Card>
  );
}
