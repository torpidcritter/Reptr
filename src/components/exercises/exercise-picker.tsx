"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchExercises, type PickerExercise } from "./actions";

/** A full-height sheet for finding an exercise. Calls onPick and stays open so several can be added. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: PickerExercise) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerExercise[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAdded([]);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchExercises(q.trim());
      if (!cancelled) setResults(r);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="bg-background text-foreground m-auto h-dvh max-h-dvh w-full max-w-lg p-0 backdrop:bg-black/60 md:h-[80dvh] md:rounded-2xl md:border"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b p-3">
          <label className="relative flex-1">
            <span className="sr-only">Search exercises</span>
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises"
              className="pl-9"
            />
          </label>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Done">
            <X />
          </Button>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(e);
                  setAdded((a) => [...a, e.id]);
                }}
                className="hover:bg-muted flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{e.detail}</p>
                </div>
                {added.includes(e.id) ? (
                  <span className="text-accent text-xs font-medium">Added</span>
                ) : (
                  <Plus className="text-muted-foreground size-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t p-3">
          <Button className="w-full" onClick={onClose}>
            Done{added.length > 0 && ` (${added.length} added)`}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
