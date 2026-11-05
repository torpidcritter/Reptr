"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteConfirmWord } from "@/modules/ops/confirm-word";
import type { DeleteState } from "./actions";

export function DeleteAccount({
  deleteAccountAction,
}: {
  deleteAccountAction: (prev: DeleteState, data: FormData) => Promise<DeleteState>;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  const [typed, setTyped] = useState("");
  return (
    <details className="group">
      <summary className="text-danger cursor-pointer text-sm font-medium">Delete account</summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          This permanently deletes your workouts, body data, photos, food log, check-ins, coach
          memories and sign-in. It can&apos;t be undone, so download your data first if you want a
          copy.
        </p>
        <label htmlFor="confirm-delete" className="text-sm">
          Type <span className="font-mono font-semibold">{deleteConfirmWord}</span> to confirm
        </label>
        <Input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <Button
          type="submit"
          variant="outline"
          className="border-danger text-danger"
          disabled={pending || typed.trim() !== deleteConfirmWord}
        >
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </details>
  );
}
