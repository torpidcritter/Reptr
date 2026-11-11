"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import type { IdentityFields as Values } from "@/modules/profile/form";

type Errors = Partial<Record<keyof Values, string>>;

const USERNAME = /^[A-Za-z0-9_]*$/;

/** What's wrong with a username as typed, checked in the browser before asking the server. */
export function usernameProblem(raw: string) {
  const u = raw.trim();
  if (!u) return "Choose a username.";
  if (!USERNAME.test(u)) return "Use only letters, numbers and underscores, with no spaces.";
  if (u.length < 3) return "Use at least 3 characters.";
  if (u.length > 20) return "Use at most 20 characters.";
  return null;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Name, username, email and bio, with messages as you type. The username is checked
 * for format straight away and for availability a moment after you stop typing.
 */
export function IdentityFields({
  initial,
  errors = {},
  checkUsername,
}: {
  initial?: Partial<Values>;
  errors?: Errors;
  checkUsername: (u: string) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [touched, setTouched] = useState(false);
  const [remote, setRemote] = useState<{ for: string; error?: string; ok?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const local = touched ? usernameProblem(username) : null;
  useEffect(() => {
    clearTimeout(timer.current);
    const u = username.trim();
    if (usernameProblem(u) || u.toLowerCase() === initial?.username?.toLowerCase()) return;
    timer.current = setTimeout(async () => {
      const res = await checkUsername(u).catch(() => ({}));
      setRemote({ for: u, ...res });
    }, 400);
    return () => clearTimeout(timer.current);
  }, [username, checkUsername, initial?.username]);

  const current = remote?.for === username.trim() ? remote : null;
  // A server message for the value that was sent wins until the person edits it.
  const usernameError =
    local ?? current?.error ?? (username === (initial?.username ?? "") ? errors.username : null);

  return (
    <>
      <Field id="displayName" label="Full name" error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          defaultValue={initial?.displayName}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
        />
      </Field>
      <Field
        id="username"
        label="Username"
        error={usernameError}
        hint={
          current?.ok ? (
            <span className="text-accent">@{username.trim().toLowerCase()} is free.</span>
          ) : (
            "3 to 20 letters, numbers or underscores. Shown as @username."
          )
        }
      >
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground" aria-hidden>
            @
          </span>
          <Input
            id="username"
            name="username"
            required
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(usernameError)}
            aria-describedby={usernameError ? "username-error" : "username-hint"}
          />
        </div>
      </Field>
      <Field
        id="contactEmail"
        label="Email (optional)"
        error={errors.contactEmail}
        hint="Only you can see it. Reptr never sends sign-in emails."
      >
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={initial?.contactEmail}
          aria-invalid={Boolean(errors.contactEmail)}
        />
      </Field>
      <Field id="bio" label="Bio (optional)" error={errors.bio}>
        <Textarea
          id="bio"
          name="bio"
          maxLength={160}
          rows={2}
          defaultValue={initial?.bio}
          aria-invalid={Boolean(errors.bio)}
        />
      </Field>
    </>
  );
}
