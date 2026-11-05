"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveGoalAction } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

export function RemoveGoal({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const ask = useConfirm();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={`Remove goal: ${name}`}
      disabled={pending}
      onClick={async () => {
        if (await ask({ title: `Remove "${name}"?`, confirm: "Remove", danger: true }))
          start(() => archiveGoalAction(id));
      }}
    >
      <X />
    </Button>
  );
}
