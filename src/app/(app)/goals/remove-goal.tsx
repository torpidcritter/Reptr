"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveGoalAction } from "./actions";

export function RemoveGoal({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={`Remove goal: ${name}`}
      disabled={pending}
      onClick={() => confirm(`Remove "${name}"?`) && start(() => archiveGoalAction(id))}
    >
      <X />
    </Button>
  );
}
