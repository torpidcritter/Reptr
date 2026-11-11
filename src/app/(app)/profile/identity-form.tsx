"use client";

import { useActionState, useState } from "react";
import { checkUsernameAction } from "@/app/(auth)/create-profile/actions";
import { ProfileKey } from "@/app/(auth)/create-profile/create-profile-form";
import { IdentityFields } from "@/components/profile/identity-fields";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import type { IdentityFields as Values, IdentityFormState } from "@/modules/profile/form";
import { newProfileKeyAction, updateIdentityAction } from "./identity-actions";

/** Edit name, username, email and bio. */
export function IdentityForm({ initial }: { initial: Values }) {
  const [state, save, saving] = useActionState<IdentityFormState, FormData>(updateIdentityAction, {
    values: initial,
  });
  return (
    <form action={save} className="flex flex-col gap-4" noValidate>
      <IdentityFields
        key={JSON.stringify(state.values ?? null) + String(state.ok)}
        initial={state.ok ? state.values : (state.values ?? initial)}
        errors={state.errors}
        checkUsername={checkUsernameAction}
      />
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

/** Makes a new profile key (the old one stops working) and shows it once. */
export function ProfileKeyCard() {
  const ask = useConfirm();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const make = async () => {
    const ok = await ask({
      title: "Make a new profile key?",
      body: "Your old key stops working. Devices that already have your profile stay signed in.",
      confirm: "Make new key",
    });
    if (!ok) return;
    setPending(true);
    const res = await newProfileKeyAction();
    setPending(false);
    if (res.error) setError(res.error);
    else setKey(res.key ?? null);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Your profile key opens your profile on another device, or here again if this browser&apos;s
        data is cleared. Lost it? Make a new one while you still have your profile open.
      </p>
      {key ? (
        <>
          <p className="text-sm font-medium">Your new key. It&apos;s shown only once.</p>
          <ProfileKey value={key} />
        </>
      ) : (
        <Button variant="outline" onClick={make} disabled={pending} className="self-start">
          {pending ? "Making…" : "Make a new profile key"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
