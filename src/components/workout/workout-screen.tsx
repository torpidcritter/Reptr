"use client";

import { CloudOff, Dumbbell, Loader2, Play, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getActiveWorkoutAction,
  previousPerformanceAction,
  repeatWorkoutAction,
  startFromRoutineAction,
} from "@/app/(app)/workout/actions";
import { ExercisePicker } from "@/components/exercises/exercise-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { UnitSystem } from "@/lib/units";
import { useWorkoutStore } from "@/lib/workout-store";
import { summarize } from "@/modules/workouts/snapshot";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import type { PreviousPerformance } from "@/modules/workouts/workouts";
import { ExerciseCard } from "./exercise-card";
import { RestTimer } from "./rest-timer";
import { formatClock, useNow } from "./use-now";

type RoutineOption = { id: string; name: string; exerciseCount: number };
type Settings = { unitSystem: UnitSystem; defaultRestSeconds: number };
type StartFrom = { routine: string } | { repeat: string };

export function WorkoutScreen({
  routines,
  settings,
  startFrom,
}: {
  routines: RoutineOption[];
  settings: Settings;
  startFrom?: StartFrom;
}) {
  const hydrated = useWorkoutStore((s) => s.hydrated);
  const workout = useWorkoutStore((s) => s.workout);
  const [serverChecked, setServerChecked] = useState(false);

  // Nothing on this device? Pick up a workout started on another one.
  useEffect(() => {
    if (!hydrated || useWorkoutStore.getState().workout) return;
    getActiveWorkoutAction()
      .then((w) => {
        if (w && !useWorkoutStore.getState().workout) {
          useWorkoutStore.getState().start(w);
          useWorkoutStore.getState().markSynced(useWorkoutStore.getState().revision);
        }
      })
      .catch(() => {})
      .finally(() => setServerChecked(true));
  }, [hydrated]);

  if (!hydrated || (!workout && !serverChecked)) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading workout…
      </div>
    );
  }

  if (!workout) return <StartPanel routines={routines} startFrom={startFrom} />;
  return <Logger settings={settings} />;
}

function StartPanel({ routines, startFrom }: { routines: RoutineOption[]; startFrom?: StartFrom }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const begin = (from?: StartFrom) =>
    start(async () => {
      setError(null);
      if (!from) return useWorkoutStore.getState().start(emptyWorkout());
      try {
        const w =
          "routine" in from
            ? await startFromRoutineAction(from.routine)
            : await repeatWorkoutAction(from.repeat);
        if (w) useWorkoutStore.getState().start(w);
        else setError("That routine or workout no longer exists.");
      } catch {
        setError("Couldn't load the routine. Check your connection, or start an empty workout.");
      }
    });

  useEffect(() => {
    if (startFrom) begin(startFrom);
    // Only on arrival with ?routine= or ?repeat=.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Start a workout</h1>
      {routines.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {routines.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={pending}
              onClick={() => begin({ routine: r.id })}
              className="text-left"
            >
              <Card className="hover:bg-muted flex items-center gap-3 transition-colors">
                <div className="bg-accent-soft flex size-10 items-center justify-center rounded-xl">
                  <Play className="text-accent size-4" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-muted-foreground text-xs">{r.exerciseCount} exercises</p>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
      <Button
        variant={routines.length ? "outline" : "primary"}
        size="lg"
        disabled={pending}
        onClick={() => begin()}
      >
        <Dumbbell /> Start an empty workout
      </Button>
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}

function SyncBadge() {
  const sync = useWorkoutStore((s) => s.sync);
  if (sync === "offline")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <CloudOff className="size-3.5" /> Offline, saved on this device
      </span>
    );
  if (sync === "error") return <span className="text-danger text-xs">Not saved, will retry</span>;
  return (
    <span className="text-muted-foreground text-xs">{sync === "saving" ? "Saving…" : "Saved"}</span>
  );
}

function Logger({ settings }: { settings: Settings }) {
  const router = useRouter();
  const workout = useWorkoutStore((s) => s.workout)!;
  const { edit } = useWorkoutStore.getState();
  const now = useNow();
  const [previous, setPrevious] = useState<PreviousPerformance>({});
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; index: number } | null>(
    null,
  );

  const exerciseIds = useMemo(
    () => [...new Set(workout.exercises.map((e) => e.exerciseId))].sort().join(","),
    [workout.exercises],
  );

  // Last time's sets for each exercise, for the "Last" column and one-tap repeats.
  useEffect(() => {
    if (!exerciseIds) return;
    previousPerformanceAction(exerciseIds.split(","), workout.id)
      .then((p) => setPrevious((old) => ({ ...old, ...p })))
      .catch(() => {});
  }, [exerciseIds, workout.id]);

  const elapsed = (now - Date.parse(workout.startedAt)) / 1000;
  const stats = summarize(workout);

  function finish() {
    const unfinished = workout.exercises
      .flatMap((e) => e.sets)
      .filter((s) => !s.completedAt).length;
    if (stats.sets === 0) {
      if (confirm("No sets are ticked off. Discard this workout?")) discard();
      return;
    }
    const msg =
      unfinished > 0
        ? `Finish workout? ${unfinished} set${unfinished === 1 ? " isn't" : "s aren't"} ticked off and won't be saved.`
        : "Finish workout?";
    if (!confirm(msg)) return;
    edit((w) => {
      w.status = "completed";
      w.finishedAt = new Date().toISOString();
    });
    useWorkoutStore.getState().stopRest();
    router.push(`/history/${workout.id}`);
  }

  function discard() {
    edit((w) => {
      w.status = "abandoned";
      w.finishedAt = new Date().toISOString();
    });
    useWorkoutStore.getState().stopRest();
    router.push("/train");
  }

  const groups = workout.exercises.map((e) => e.supersetGroup);

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="bg-background/95 sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Workout name"
            value={workout.name}
            maxLength={80}
            onChange={(e) =>
              edit((w) => {
                w.name = e.target.value || "Workout";
              })
            }
            className="h-auto border-0 bg-transparent p-0 text-lg font-semibold focus-visible:ring-0"
          />
          <p className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
            {formatClock(elapsed)} · {stats.sets} sets <SyncBadge />
          </p>
        </div>
        <Button onClick={finish}>Finish</Button>
      </div>

      {workout.exercises.map((e, i) => (
        <ExerciseCard
          key={e.id}
          exercise={e}
          index={i}
          count={workout.exercises.length}
          previous={previous[e.exerciseId]}
          units={settings.unitSystem}
          defaultRest={settings.defaultRestSeconds}
          restAfterSet={e.supersetGroup == null || groups[i + 1] !== e.supersetGroup}
          onSwap={() => setPicker({ mode: "swap", index: i })}
        />
      ))}

      <Button variant="outline" size="lg" onClick={() => setPicker({ mode: "add" })}>
        <Plus /> Add exercise
      </Button>
      <Button
        variant="ghost"
        className="text-danger"
        onClick={() => confirm("Discard this workout? Nothing will be saved.") && discard()}
      >
        Discard workout
      </Button>

      <ExercisePicker
        open={picker != null}
        onClose={() => setPicker(null)}
        onPick={async (picked) => {
          const p = await previousPerformanceAction([picked.id]).catch(
            () => ({}) as PreviousPerformance,
          );
          setPrevious((old) => ({ ...old, ...p }));
          const base = {
            exerciseId: picked.id,
            name: picked.name,
            measurement: picked.measurement,
          };
          if (picker?.mode === "swap") {
            const index = picker.index;
            edit((w) => {
              const old = w.exercises[index];
              const next = exerciseFor(base, {
                sets: Math.max(old.sets.length, 1),
                previous: p[picked.id],
              });
              w.exercises[index] = {
                ...next,
                id: old.id,
                supersetGroup: old.supersetGroup,
                restSeconds: old.restSeconds,
                substitutedFromId: old.substitutedFromId ?? old.exerciseId,
              };
            });
            setPicker(null);
          } else {
            edit((w) => {
              w.exercises.push(exerciseFor(base, { sets: 3, previous: p[picked.id] }));
            });
          }
        }}
      />
      <RestTimer />
    </div>
  );
}
