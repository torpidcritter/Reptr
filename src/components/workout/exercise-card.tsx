"use client";

import { ArrowDown, ArrowUp, Link2, MoreVertical, Plus, Repeat, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { weightUnitLabel, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { useWorkoutStore } from "@/lib/workout-store";
import { fieldsFor, isSetFilled, type ExerciseSnapshot } from "@/modules/workouts/snapshot";
import type { PreviousPerformance } from "@/modules/workouts/workouts";
import { SetRow } from "./set-row";

export function ExerciseCard({
  exercise,
  index,
  count,
  previous,
  units,
  defaultRest,
  restAfterSet,
  onSwap,
}: {
  exercise: ExerciseSnapshot;
  index: number;
  count: number;
  previous?: PreviousPerformance[string];
  units: UnitSystem;
  defaultRest: number;
  /** False for an exercise mid-superset: go straight to the next exercise. */
  restAfterSet: boolean;
  onSwap: () => void;
}) {
  const { updateSet, addSet, removeSet, edit, startRest } = useWorkoutStore.getState();
  const [menu, setMenu] = useState(false);
  const f = fieldsFor(exercise.measurement);
  const prevWorking = previous?.sets.filter((s) => s.type !== "warmup") ?? [];
  const rest = exercise.restSeconds ?? defaultRest;

  let working = 0;
  const workingNumbers = exercise.sets.map((s) => (s.type === "working" ? ++working : working));

  function toggle(setId: string) {
    const set = exercise.sets.find((s) => s.id === setId)!;
    if (set.completedAt) return updateSet(exercise.id, setId, { completedAt: null });

    // Tapping done on an untouched set accepts last time's numbers, shown as placeholders.
    const i = exercise.sets.indexOf(set);
    const prev = set.type === "warmup" ? undefined : prevWorking[workingNumbers[i] - 1];
    const filled = {
      weightKg: set.weightKg ?? prev?.weightKg ?? null,
      reps: set.reps ?? prev?.reps ?? null,
      durationSeconds: set.durationSeconds ?? prev?.durationSeconds ?? null,
      distanceMeters: set.distanceMeters ?? prev?.distanceMeters ?? null,
    };
    if (!isSetFilled({ ...set, ...filled }, exercise.measurement)) {
      navigator.vibrate?.(80);
      return;
    }
    updateSet(exercise.id, setId, { ...filled, completedAt: new Date().toISOString() });
    if (restAfterSet && set.type !== "warmup") startRest(rest);
  }

  const headers = [
    "Set",
    "Last",
    f.weight &&
      (exercise.measurement === "assisted_reps"
        ? `Assist ${weightUnitLabel(units)}`
        : weightUnitLabel(units)),
    f.distance && (units === "metric" ? "km" : "mi"),
    f.duration && (f.distance ? "min" : "sec"),
    f.reps && "Reps",
    "",
  ].filter((h) => h !== false);

  return (
    <Card className={cn("p-3", exercise.supersetGroup && "border-l-accent border-l-4")}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/exercises/${exercise.exerciseId}`}
            className="font-semibold hover:underline"
          >
            {exercise.name}
          </Link>
          <p className="text-muted-foreground text-xs">
            {exercise.supersetGroup && (
              <span className="text-accent mr-2 inline-flex items-center gap-1">
                <Link2 className="size-3" /> Superset
              </span>
            )}
            Rest {rest}s
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Exercise options"
          onClick={() => setMenu((m) => !m)}
        >
          <MoreVertical />
        </Button>
      </div>

      {menu && (
        <div className="bg-muted mb-3 grid grid-cols-2 gap-2 rounded-xl p-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMenu(false);
              onSwap();
            }}
          >
            <Repeat /> Swap
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const v = prompt("Rest between sets, in seconds", String(rest));
              if (v != null && v !== "" && !Number.isNaN(Number(v)))
                edit((w) => {
                  w.exercises[index].restSeconds = Math.min(
                    1800,
                    Math.max(0, Math.round(Number(v))),
                  );
                });
              setMenu(false);
            }}
          >
            <Timer /> Rest time
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() =>
              edit((w) => {
                [w.exercises[index - 1], w.exercises[index]] = [
                  w.exercises[index],
                  w.exercises[index - 1],
                ];
              })
            }
          >
            <ArrowUp /> Move up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === count - 1}
            onClick={() =>
              edit((w) => {
                [w.exercises[index + 1], w.exercises[index]] = [
                  w.exercises[index],
                  w.exercises[index + 1],
                ];
              })
            }
          >
            <ArrowDown /> Move down
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger col-span-2"
            onClick={() => {
              if (
                !exercise.sets.some((s) => s.completedAt) ||
                confirm(`Remove ${exercise.name} and its sets?`)
              )
                edit((w) => {
                  w.exercises.splice(index, 1);
                });
            }}
          >
            <Trash2 /> Remove exercise
          </Button>
        </div>
      )}

      <div
        className={cn(
          "text-muted-foreground grid gap-1.5 px-1 pb-1 text-center text-[11px] font-medium uppercase",
          headers.length === 5
            ? "grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem]"
            : "grid-cols-[2.5rem_1fr_1fr_2.75rem]",
        )}
      >
        {headers.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={set.id}
            index={i}
            workingNumber={workingNumbers[i]}
            set={set}
            previous={set.type === "warmup" ? undefined : prevWorking[workingNumbers[i] - 1]}
            measurement={exercise.measurement}
            units={units}
            onChange={(patch) => updateSet(exercise.id, set.id, patch)}
            onToggle={() => toggle(set.id)}
            onRemove={() => removeSet(exercise.id, set.id)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => addSet(exercise.id)}>
        <Plus /> Add set
      </Button>
    </Card>
  );
}
