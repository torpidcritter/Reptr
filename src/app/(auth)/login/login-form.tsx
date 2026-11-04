"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="text-accent size-10" />
        <p className="font-semibold">Check your email</p>
        <p className="text-muted-foreground text-sm">
          We sent a sign-in link to {state.email}. Open it on this device.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? "email-error" : undefined}
      />
      {state.status === "error" && (
        <p id="email-error" className="text-danger text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
