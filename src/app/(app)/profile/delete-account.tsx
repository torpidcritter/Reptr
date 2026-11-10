"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgetDeletedAccount } from "@/lib/device/session";
import { deleteConfirmWord } from "@/modules/ops/confirm-word";
import type { DeleteState } from "./actions";

export function DeleteAccount({
  deleteAccountAction,
}: {
  deleteAccountAction: (prev: DeleteState, data: FormData) => Promise<DeleteState>;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  const [typed, setTyped] = useState("");
  // Once the server confirms, nothing of the account is left on this device either.
  useEffect(() => {
    if (state.deleted) forgetDeletedAccount();
  }, [state.deleted]);
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
          disabled={pending || state.deleted || typed.trim() !== deleteConfirmWord}
        >
          {pending || state.deleted ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </details>
  );
}
