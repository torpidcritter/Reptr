"use client";

import { Download, HardDrive, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { getActiveWorkoutAction } from "@/app/(app)/workout/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { unreadableData, useStorageHealth } from "@/lib/device/scope";
import { safeReload } from "@/lib/device/session";
import { useOutbox } from "@/lib/outbox";
import { useWorkoutStore } from "@/lib/workout-store";
import { completedSetCount, recoverAsNewWorkout } from "@/modules/workouts/recover";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Things on this device that need the person: a workout the server couldn't take, an app
 * update that needs a reload before syncing can continue, or storage that's failing.
 * Shown at the top of every app page until resolved.
 */
export function DeviceAlerts() {
  return (
    <div className="flex flex-col gap-3 empty:hidden">
      <WorkoutConflict />
      <UpdateNeeded />
      <StorageWarning />
    </div>
  );
}

function Alert({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      role="alert"
      className="border-danger/40 bg-card mb-4 flex gap-3 rounded-xl border p-4 text-sm shadow-sm"
    >
      <span className="text-danger mt-0.5 shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </section>
  );
}

function WorkoutConflict() {
  const ask = useConfirm();
  const router = useRouter();
  const conflict = useWorkoutStore((s) => s.conflict);
  const workout = useWorkoutStore((s) => s.workout);
  if (!conflict || !workout) return null;

  const discard = async (what: string) => {
    const n = completedSetCount(workout);
    const ok = await ask({
      title: `Discard ${what}?`,
      body: n
        ? `${plural(n, "logged set")} on this device will be deleted for good.`
        : "Nothing logged on this device will be lost.",
      confirm: "Discard",
      danger: true,
    });
    if (ok) useWorkoutStore.getState().clear();
    return ok;
  };

  if (conflict.kind === "finished_elsewhere") {
    const n = conflict.unsyncedSetIds.length;
    return (
      <Alert icon={<TriangleAlert className="size-5" />} title="Some sets weren't saved">
        <p className="text-muted-foreground">
          &ldquo;{workout.name}&rdquo; was {conflict.status === "completed" ? "finished" : "ended"}{" "}
          on another device, but this device has {plural(n, "set")} it never received. They are safe
          here until you choose.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const r = recoverAsNewWorkout(workout, conflict.unsyncedSetIds, () =>
                crypto.randomUUID(),
              );
              if (r) useWorkoutStore.getState().replaceWith(r);
              else useWorkoutStore.getState().clear();
            }}
          >
            Save them as a separate workout
          </Button>
          <Button variant="outline" onClick={() => discard("these sets")}>
            Discard them
          </Button>
        </div>
      </Alert>
    );
  }

  if (conflict.kind === "active_elsewhere") {
    const started = new Date(conflict.other.startedAt).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return (
      <Alert
        icon={<TriangleAlert className="size-5" />}
        title="Another workout is in progress on another device"
      >
        <p className="text-muted-foreground">
          &ldquo;{conflict.other.name}&rdquo; (started {started}) is still open elsewhere. Only one
          workout can be in progress. Nothing has been changed yet.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => useWorkoutStore.getState().takeOverHere()}>
            Finish that one, continue here
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!(await discard(`"${workout.name}" on this device`))) return;
              const other = await getActiveWorkoutAction().catch(() => null);
              if (other) {
                const { version, ...snapshot } = other;
                useWorkoutStore.getState().start(snapshot, version);
                useWorkoutStore.getState().markSynced(useWorkoutStore.getState().revision);
              }
              router.push("/workout");
            }}
          >
            Discard this one, open that one
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Finishing keeps every set already logged in that workout.
        </p>
      </Alert>
    );
  }

  return (
    <Alert
      icon={<TriangleAlert className="size-5" />}
      title="This workout belongs to another account"
    >
      <p className="text-muted-foreground">
        It was started under a different sign-in on this device, so it can&apos;t be saved to yours.
        Sign in with that account to keep it.
      </p>
      <div>
        <Button variant="outline" onClick={() => discard("it from this device")}>
          Discard it
        </Button>
      </div>
    </Alert>
  );
}

function UpdateNeeded() {
  const workoutPaused = useWorkoutStore((s) => s.sync === "paused");
  const outboxBlocked = useOutbox((s) => s.blocked === "stale_build");
  if (!workoutPaused && !outboxBlocked) return null;
  return (
    <Alert icon={<RefreshCw className="size-5" />} title="Reptr was updated">
      <p className="text-muted-foreground">
        Reload to keep syncing. Everything you&apos;ve logged is saved on this device and carries on
        after the reload, including the workout in progress.
      </p>
      <div>
        <Button onClick={() => safeReload()}>
          <RefreshCw /> Reload now
        </Button>
      </div>
    </Alert>
  );
}

function StorageWarning() {
  const error = useStorageHealth((s) => s.writeError);
  const unreadable = useStorageHealth((s) => s.unreadable);
  if (!error && !unreadable.length) return null;
  return (
    <Alert icon={<HardDrive className="size-5" />} title="Device storage problem">
      {error && <p className="text-muted-foreground">{error}</p>}
      {unreadable.length > 0 && (
        <>
          <p className="text-muted-foreground">
            {unreadable.includes("reptr-active-workout")
              ? "The workout saved on this device couldn't be read, so Reptr started without it."
              : "Some changes saved on this device couldn't be read, so Reptr started without them."}{" "}
            A copy is kept on this device. Download it to keep it, or send it to support.
          </p>
          <div className="flex gap-3">
            <Button size="sm" variant="outline" onClick={downloadUnreadable}>
              <Download /> Download the copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => useStorageHealth.setState({ unreadable: [] })}
            >
              Dismiss
            </Button>
          </div>
        </>
      )}
    </Alert>
  );
}

async function downloadUnreadable() {
  const data = await unreadableData();
  if (!data) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "reptr-device-copy.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
