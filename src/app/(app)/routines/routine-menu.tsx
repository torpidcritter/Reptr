"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { archiveRoutineAction, duplicateRoutineAction } from "./actions";

export function RoutineMenu({ id, name }: { id: string; name: string }) {
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
        onClick={() => {
          if (confirm(`Delete "${name}"? Past workouts from it are kept.`)) {
            start(() => archiveRoutineAction(id));
          }
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
