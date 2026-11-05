"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { equipmentList, muscles } from "@/db/seed/muscles";
import { searchExercises, similarExercisesAction, type PickerExercise } from "./actions";

/** A full-height sheet for finding an exercise. Calls onPick and stays open so several can be added. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  similarTo,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: PickerExercise) => void;
  /** When swapping, list alternatives for this exercise above the search results. */
  similarTo?: { id: string; name: string };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [gear, setGear] = useState("");
  const [results, setResults] = useState<PickerExercise[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [found, setFound] = useState<{
    id: string;
    items: (PickerExercise & { reason: string })[];
  } | null>(null);
  const similarId = similarTo?.id;
  const similar = found && found.id === similarId ? found.items : [];

  useEffect(() => {
    if (!open || !similarId) return;
    let cancelled = false;
    similarExercisesAction(similarId)
      .then((items) => !cancelled && setFound({ id: similarId, items }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, similarId]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAdded([]);
      setQ("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchExercises(q.trim(), { muscle, equipment: gear });
      if (!cancelled) setResults(r);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, muscle, gear, open]);

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
        <div className="grid grid-cols-2 gap-2 border-b px-3 py-2">
          <label>
            <span className="sr-only">Muscle</span>
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="h-10">
              <option value="">All muscles</option>
              {muscles.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Equipment</span>
            <Select value={gear} onChange={(e) => setGear(e.target.value)} className="h-10">
              <option value="">All equipment</option>
              {equipmentList
                .filter((x) => x.slug !== "none")
                .map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                  </option>
                ))}
            </Select>
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results?.length === 0 && (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              No exercises match. Try fewer words or clear a filter.
            </p>
          )}
          {similarTo && similar.length > 0 && q.trim() === "" && (
            <section aria-label={`Alternatives to ${similarTo.name}`} className="border-b">
              <h2 className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-semibold uppercase">
                Similar to {similarTo.name}
              </h2>
              <ul className="divide-y">
                {similar.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onPick(e)}
                      className="hover:bg-muted flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.name}</p>
                        <p className="text-muted-foreground truncate text-sm">{e.reason}</p>
                      </div>
                      <Plus className="text-muted-foreground size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <h2 className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-semibold uppercase">
                All exercises
              </h2>
            </section>
          )}
          <ul className="divide-y">
            {(results ?? []).map((e) => (
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
        </div>
        <div className="border-t p-3">
          <Button className="w-full" onClick={onClose}>
            Done{added.length > 0 && ` (${added.length} added)`}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
