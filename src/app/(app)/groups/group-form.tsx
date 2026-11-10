"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGroupAction, updateGroupAction } from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Values = { name: string; description: string; visibility: "public" | "private" };

/** Creates a group, or edits one when `id` is given. */
export function GroupForm({ id, initial }: { id?: string; initial?: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(
    initial ?? { name: "", description: "", visibility: "private" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      setSaved(false);
      const res = id ? await updateGroupAction(id, v) : await createGroupAction(v);
      if (res.error) return setError(res.error);
      if (id) {
        setSaved(true);
        router.refresh();
      } else router.push(`/groups/${res.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="group-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="group-name"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          required
          minLength={3}
          maxLength={40}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="group-description" className="text-sm font-medium">
          Description (optional)
        </label>
        <Textarea
          id="group-description"
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          maxLength={280}
          rows={2}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who can join</legend>
        {(
          [
            ["private", "Invite only", "People join with the invite code you share."],
            ["public", "Anyone", "The group shows up in search and anyone can join."],
          ] as const
        ).map(([value, title, body]) => (
          <label key={value} className="flex items-start gap-3 rounded-xl border p-3">
            <input
              type="radio"
              name="group-visibility"
              checked={v.visibility === value}
              onChange={() => setV({ ...v, visibility: value })}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{title}</span>
              <span className="text-muted-foreground text-sm">{body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : id ? "Save" : "Create group"}
      </Button>
    </form>
  );
}
