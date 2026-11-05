"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memoryKindLabels, memoryKinds } from "@/modules/coach/memory-kinds";
import { addMemoryAction, deleteMemoryAction } from "./actions";

type Memory = { id: string; kind: string; content: string };

export function MemoryPanel({ memories }: { memories: Memory[] }) {
  const [kind, setKind] = useState<string>("injury");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addMemoryAction({ kind, content });
      if (res.error) return setError(res.error);
      setError(null);
      setContent("");
    });
  };

  return (
    <details className="border-border mb-4 rounded-xl border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        What the coach remembers ({memories.length})
      </summary>
      <p className="text-muted-foreground mt-2 text-xs">
        The coach reads these at the start of every conversation. Add injuries, equipment, the days
        you can train or anything you&apos;d rather avoid.
      </p>
      {memories.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground text-xs">
                  {memoryKindLabels[m.kind as keyof typeof memoryKindLabels] ?? m.kind}:{" "}
                </span>
                {m.content}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Forget: ${m.content}`}
                disabled={pending}
                onClick={() => start(() => deleteMemoryAction(m.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Kind of note"
          className="bg-background h-11 rounded-lg border px-3 text-sm"
        >
          {memoryKinds.map((k) => (
            <option key={k} value={k}>
              {memoryKindLabels[k]}
            </option>
          ))}
        </select>
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={300}
          placeholder="e.g. Left shoulder: avoid overhead pressing"
          aria-label="Note"
          className="flex-1"
        />
        <Button type="submit" disabled={pending || !content.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-danger mt-2 text-xs">{error}</p>}
    </details>
  );
}
