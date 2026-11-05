"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { endProgramAction } from "./actions";

export function EndProgram({ name }: { name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => confirm(`End "${name}"?`) && start(() => endProgramAction())}
    >
      End block
    </Button>
  );
}
