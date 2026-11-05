"use client";

import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ExercisePicker } from "@/components/exercises/exercise-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toSupersetGroups } from "@/modules/routines/supersets";
import { saveRoutineAction } from "./actions";

export type BuilderItem = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  restSeconds: number | null;
  /** Linked to the next exercise as a superset. */
  linkNext: boolean;
};

type Initial = {
  id: string | null;
  name: string;
  notes: string | null;
  scheduleDays: number[];
  items: BuilderItem[];
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const num = (v: string) => (v === "" ? null : Number(v));

export function RoutineBuilder({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.name);
  const [items, setItems] = useState(initial.items);
  const [days, setDays] = useState<number[]>(initial.scheduleDays);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<BuilderItem>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const move = (i: number, by: -1 | 1) =>
    setItems((xs) => {
      const next = [...xs];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  function save() {
    setError(null);
    const groups = toSupersetGroups(items);
    startTransition(async () => {
      const res = await saveRoutineAction(initial.id, {
        name,
        notes: initial.notes,
        scheduleDays: days,
        items: items.map((x, i) => ({
          exerciseId: x.exerciseId,
          targetSets: x.targetSets,
          targetRepsMin: x.targetRepsMin,
          targetRepsMax: x.targetRepsMax,
          restSeconds: x.restSeconds,
          supersetGroup: groups[i],
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Routine name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Push day"
          maxLength={60}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Planned days</legend>
        <div className="flex flex-wrap gap-1.5">
          {weekdays.map((d, i) => {
            const on = days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDays((xs) => (on ? xs.filter((x) => x !== i) : [...xs, i].sort()))
                }
                className={cn(
                  "h-10 min-w-12 rounded-lg border px-3 text-sm font-medium transition-colors",
                  on ? "bg-accent text-accent-foreground border-accent" : "hover:bg-muted",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
        <span className="text-muted-foreground text-xs">
          Shows on your calendar and home screen on these days. Leave empty to train it whenever.
        </span>
      </fieldset>

      <ol className="flex flex-col gap-2">
        {items.map((item, i) => {
          const linkedFromPrev = i > 0 && items[i - 1].linkNext;
          return (
            <li key={item.key}>
              <Card
                className={cn(
                  "p-3",
                  (item.linkNext || linkedFromPrev) && "border-l-accent border-l-4",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5 w-6 text-sm tabular-nums">
                    {i + 1}
                  </span>
                  <p className="flex-1 font-medium">{item.exerciseName}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Move down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${item.exerciseName}`}
                    onClick={() => setItems((xs) => xs.filter((x) => x.key !== item.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 pl-8">
                  {(
                    [
                      ["targetSets", "Sets"],
                      ["targetRepsMin", "Reps from"],
                      ["targetRepsMax", "Reps to"],
                      ["restSeconds", "Rest (s)"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-[11px]">{label}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={item[field] ?? ""}
                        onChange={(e) => update(item.key, { [field]: num(e.target.value) })}
                        className="h-10 px-2 text-center"
                      />
                    </label>
                  ))}
                </div>
                {i < items.length - 1 && (
                  <button
                    type="button"
                    onClick={() => update(item.key, { linkNext: !item.linkNext })}
                    className={cn(
                      "mt-2 ml-8 inline-flex items-center gap-1.5 text-xs font-medium",
                      item.linkNext ? "text-accent" : "text-muted-foreground",
                    )}
                    aria-pressed={item.linkNext}
                  >
                    <Link2 className="size-3.5" />
                    {item.linkNext ? "Superset with next" : "Make superset with next"}
                  </button>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      <Button variant="outline" onClick={() => setPicking(true)}>
        <Plus /> Add exercises
      </Button>

      {error && <p className="text-danger text-sm">{error}</p>}
      <Button size="lg" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save routine"}
      </Button>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(e) =>
          setItems((xs) => [
            ...xs,
            {
              key: crypto.randomUUID(),
              exerciseId: e.id,
              exerciseName: e.name,
              targetSets: 3,
              targetRepsMin: 8,
              targetRepsMax: 12,
              restSeconds: null,
              linkNext: false,
            },
          ])
        }
      />
    </div>
  );
}
