"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createGoalAction } from "./actions";

type Kind = "strength" | "bodyweight" | "consistency";

const kinds: { value: Kind; label: string; hint: string }[] = [
  { value: "strength", label: "Lift", hint: "Reach an estimated 1-rep max" },
  { value: "bodyweight", label: "Body weight", hint: "Reach a trend weight" },
  { value: "consistency", label: "Consistency", hint: "Train a number of times each week" },
];

const field = "bg-background h-11 w-full rounded-lg border px-3 text-base";

export function GoalForm({
  exercises,
  unit,
  onDone,
}: {
  exercises: { id: string; name: string }[];
  unit: "kg" | "lb";
  onDone?: () => void;
}) {
  const [kind, setKind] = useState<Kind>(exercises.length ? "strength" : "bodyweight");
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createGoalAction({
        kind,
        exerciseId: kind === "strength" ? exerciseId : undefined,
        target,
        targetDate: date,
      });
      if (res.error) return setError(res.error);
      setError(null);
      setTarget("");
      setDate("");
      onDone?.();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Type of goal</legend>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "flex-auto rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                kind === k.value
                  ? "bg-accent text-accent-foreground border-accent"
                  : "hover:bg-muted",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {kinds.find((k) => k.value === kind)!.hint}
        </p>
      </fieldset>

      {kind === "strength" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Exercise</span>
          {exercises.length ? (
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className={field}
            >
              {exercises.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground text-sm">
              Log a weighted exercise in a workout first.
            </span>
          )}
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            {kind === "strength"
              ? `Target 1RM (${unit})`
              : kind === "bodyweight"
                ? `Target weight (${unit})`
                : "Workouts per week"}
          </span>
          <Input
            required
            inputMode={kind === "consistency" ? "numeric" : "decimal"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={kind === "consistency" ? "3" : kind === "strength" ? "100" : "75"}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">By (optional)</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={pending || (kind === "strength" && !exercises.length)}>
        {pending ? "Saving…" : "Add goal"}
      </Button>
    </form>
  );
}
