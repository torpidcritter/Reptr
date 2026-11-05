"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { endProgramAction } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

export function EndProgram({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const ask = useConfirm();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (
          await ask({
            title: `End "${name}"?`,
            body: "Past workouts stay in your history.",
            confirm: "End block",
            danger: true,
          })
        )
          start(() => endProgramAction());
      }}
    >
      End block
    </Button>
  );
}
