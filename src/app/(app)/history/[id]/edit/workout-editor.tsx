"use client";

import { Plus, Replace, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExercisePicker } from "@/components/exercises/exercise-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/input";
import { displayWeight, toStoredWeight, type UnitSystem, weightUnitLabel } from "@/lib/units";
import {
  emptySet,
  fieldsFor,
  type SetSnapshot,
  type WorkoutSnapshot,
} from "@/modules/workouts/snapshot";
import { correctWorkoutAction, deleteWorkoutAction } from "../actions";

const setTypes: { value: SetSnapshot["type"]; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "warmup", label: "Warm-up" },
  { value: "drop", label: "Drop" },
  { value: "failure", label: "To failure" },
  { value: "rest_pause", label: "Rest-pause" },
];

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * Fixes a finished workout: numbers, set types, removed or added sets, the exercise
 * itself. Saving rebuilds the personal records it affects.
 */
export function WorkoutEditor({ workout, units }: { workout: WorkoutSnapshot; units: UnitSystem }) {
  const router = useRouter();
  const ask = useConfirm();
  const [w, setW] = useState(() => structuredClone(workout));
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unit = weightUnitLabel(units);

  const edit = (fn: (draft: WorkoutSnapshot) => void) =>
    setW((cur) => {
      const next = structuredClone(cur);
      fn(next);
      return next;
    });
  const patchSet = (ei: number, si: number, patch: Partial<SetSnapshot>) =>
    edit((d) => Object.assign(d.exercises[ei].sets[si], patch));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await correctWorkoutAction(w);
      if (!res.ok) return setError(res.error);
      router.push(`/history/${w.id}`);
    });

  const remove = async () => {
    const ok = await ask({
      title: "Delete this workout?",
      body: "Its sets and any records it set are removed for good. Records are recalculated from your other workouts.",
      confirm: "Delete workout",
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteWorkoutAction(w.id);
      if (!res.ok) return setError(res.error);
      router.push("/history");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="workout-name">
          Name
        </label>
        <Input
          id="workout-name"
          value={w.name}
          maxLength={80}
          onChange={(e) => edit((d) => void (d.name = e.target.value))}
        />
        <label className="text-sm font-medium" htmlFor="workout-notes">
          Notes
        </label>
        <Input
          id="workout-notes"
          value={w.notes ?? ""}
          maxLength={2000}
          onChange={(e) => edit((d) => void (d.notes = e.target.value || null))}
        />
      </Card>

      {w.exercises.map((e, ei) => {
        const f = fieldsFor(e.measurement);
        return (
          <Card key={e.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{e.name}</p>
              <Button variant="outline" size="sm" onClick={() => setSwapFor(e.id)}>
                <Replace /> Change exercise
              </Button>
            </div>
            <ol className="flex flex-col gap-3">
              {e.sets.map((s, si) => (
                <li key={s.id} className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select
                      aria-label={`Set ${si + 1} type`}
                      value={s.type}
                      onChange={(ev) =>
                        patchSet(ei, si, { type: ev.target.value as SetSnapshot["type"] })
                      }
                    >
                      {setTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    {f.weight && (
                      <Input
                        aria-label={`Set ${si + 1} weight (${unit})`}
                        inputMode="decimal"
                        defaultValue={s.weightKg != null ? displayWeight(s.weightKg, units, 2) : ""}
                        onChange={(ev) => {
                          const v = num(ev.target.value);
                          patchSet(ei, si, {
                            weightKg: v == null ? null : toStoredWeight(v, units),
                          });
                        }}
                      />
                    )}
                    {f.reps && (
                      <Input
                        aria-label={`Set ${si + 1} reps`}
                        inputMode="numeric"
                        defaultValue={s.reps ?? ""}
                        onChange={(ev) => patchSet(ei, si, { reps: num(ev.target.value) })}
                      />
                    )}
                    {f.duration && (
                      <Input
                        aria-label={`Set ${si + 1} seconds`}
                        inputMode="numeric"
                        defaultValue={s.durationSeconds ?? ""}
                        onChange={(ev) =>
                          patchSet(ei, si, { durationSeconds: num(ev.target.value) })
                        }
                      />
                    )}
                    {f.distance && (
                      <Input
                        aria-label={`Set ${si + 1} metres`}
                        inputMode="decimal"
                        defaultValue={s.distanceMeters ?? ""}
                        onChange={(ev) =>
                          patchSet(ei, si, { distanceMeters: num(ev.target.value) })
                        }
                      />
                    )}
                    <Input
                      aria-label={`Set ${si + 1} RPE`}
                      placeholder="RPE"
                      inputMode="decimal"
                      defaultValue={s.rpe ?? ""}
                      onChange={(ev) => patchSet(ei, si, { rpe: num(ev.target.value) })}
                    />
                    <Input
                      aria-label={`Set ${si + 1} RIR`}
                      placeholder="RIR"
                      inputMode="numeric"
                      defaultValue={s.rir ?? ""}
                      onChange={(ev) => patchSet(ei, si, { rir: num(ev.target.value) })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete set ${si + 1}`}
                    className="text-muted-foreground hover:text-danger self-center p-2"
                    onClick={() => edit((d) => void d.exercises[ei].sets.splice(si, 1))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                edit((d) => {
                  const last = d.exercises[ei].sets.at(-1);
                  d.exercises[ei].sets.push({
                    ...emptySet(crypto.randomUUID(), last),
                    completedAt: last?.completedAt ?? d.finishedAt,
                  });
                })
              }
            >
              <Plus /> Add a set I forgot
            </Button>
          </Card>
        );
      })}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={save} disabled={pending} className="flex-1">
          {pending ? "Saving…" : "Save correction"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => router.push(`/history/${w.id}`)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      <Button
        variant="outline"
        className="border-danger text-danger"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 /> Delete this workout
      </Button>

      <ExercisePicker
        open={swapFor !== null}
        onClose={() => setSwapFor(null)}
        similarTo={
          swapFor
            ? (() => {
                const e = w.exercises.find((x) => x.id === swapFor)!;
                return { id: e.exerciseId, name: e.name };
              })()
            : undefined
        }
        onPick={(picked) => {
          edit((d) => {
            const e = d.exercises.find((x) => x.id === swapFor);
            if (!e) return;
            e.exerciseId = picked.id;
            e.name = picked.name;
            e.measurement = picked.measurement;
          });
          setSwapFor(null);
        }}
      />
    </div>
  );
}
