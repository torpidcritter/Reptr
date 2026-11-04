"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkoutStore } from "@/lib/workout-store";

/** Shown right after finishing, while the workout is still on its way to the server. */
export function PendingWorkout({ id }: { id: string }) {
  const router = useRouter();
  const local = useWorkoutStore((s) => (s.workout?.id === id ? s.workout : null));
  const sync = useWorkoutStore((s) => s.sync);

  useEffect(() => {
    if (!local) {
      router.refresh();
      return;
    }
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [local, router]);

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {local
        ? sync === "offline"
          ? "Workout saved on this device. It'll upload when you're back online."
          : "Saving your workout…"
        : "Loading…"}
    </div>
  );
}
