"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unblockAction } from "../actions";

export function BlockedList({
  people,
}: {
  people: { userId: string; handle: string | null; displayName: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!people.length)
    return <p className="text-muted-foreground text-sm">You haven&apos;t blocked anyone.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center justify-between gap-3">
          <span className="truncate text-sm">
            {p.displayName ?? (p.handle ? `@${p.handle}` : "Someone who left social features")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await unblockAction(p.userId);
                router.refresh();
              })
            }
          >
            Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}
