"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinByCodeAction, joinGroupAction } from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await joinByCodeAction(code);
          if (res.error) return setError(res.error);
          router.push(`/groups/${res.id}`);
        });
      }}
    >
      <label htmlFor="invite-code" className="text-sm font-medium">
        Have an invite code?
      </label>
      <div className="flex gap-2">
        <Input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
        />
        <Button type="submit" disabled={pending || !code.trim()}>
          Join
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  );
}

export function JoinButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        aria-label={`Join ${name}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await joinGroupAction(id);
            if (res.error) return setError(res.error);
            router.refresh();
          })
        }
      >
        Join
      </Button>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
