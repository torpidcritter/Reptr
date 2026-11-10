"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink, verifyCode, type LoginState } from "./actions";

export function LoginForm() {
  const [sent, send, sending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: "idle",
  });
  const [restart, setRestart] = useState(0);

  if (sent.status === "sent" && sent.email && restart === 0) {
    return <CodeForm email={sent.email} onRestart={() => setRestart((n) => n + 1)} />;
  }

  return (
    <form
      action={(fd) => {
        setRestart(0);
        send(fd);
      }}
      className="flex flex-col gap-3"
    >
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
        defaultValue={sent.email}
        required
        aria-invalid={sent.status === "error"}
        aria-describedby={sent.status === "error" ? "email-error" : undefined}
      />
      {sent.status === "error" && (
        <p id="email-error" role="alert" className="text-danger text-sm">
          {sent.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

function CodeForm({ email, onRestart }: { email: string; onRestart: () => void }) {
  const [state, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, {
    status: "sent",
    email,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <MailCheck className="text-accent size-10" />
        <p className="font-semibold">Check your email</p>
        <p className="text-muted-foreground text-sm">
          We sent a sign-in link and a 6-digit code to {email}. Tap the link, or type the code here
          if the link opens somewhere else.
        </p>
      </div>
      <form action={verify} className="flex flex-col gap-3">
        <input type="hidden" name="email" value={email} />
        <label htmlFor="code" className="text-sm font-medium">
          Code from the email
        </label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          required
          aria-invalid={Boolean(state.message)}
          aria-describedby={state.message ? "code-error" : undefined}
        />
        {state.message && (
          <p id="code-error" role="alert" className="text-danger text-sm">
            {state.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in with code"}
        </Button>
      </form>
      <button
        type="button"
        onClick={onRestart}
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
      >
        Use a different email or send a new link
      </button>
    </div>
  );
}
