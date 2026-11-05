"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { archiveRoutineAction, duplicateRoutineAction } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

export function RoutineMenu({ id, name }: { id: string; name: string }) {
  const ask = useConfirm();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Link
        href={`/routines/${id}/edit`}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label={`Edit ${name}`}
      >
        <Pencil />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Duplicate ${name}`}
        disabled={pending}
        onClick={() => start(() => duplicateRoutineAction(id))}
      >
        <Copy />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${name}`}
        disabled={pending}
        onClick={async () => {
          if (
            await ask({
              title: `Delete "${name}"?`,
              body: "Past workouts from it are kept.",
              confirm: "Delete",
              danger: true,
            })
          )
            start(() => archiveRoutineAction(id));
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
