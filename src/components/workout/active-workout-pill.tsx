"use client";

import { Dumbbell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkoutStore } from "@/lib/workout-store";
import { formatClock, useNow } from "./use-now";

/** A floating shortcut back to the workout in progress, shown on every other page. */
export function ActiveWorkoutPill() {
  const workout = useWorkoutStore((s) => s.workout);
  const pathname = usePathname();
  const now = useNow();
  if (!workout || workout.status !== "active" || pathname.startsWith("/workout")) return null;

  return (
    <Link
      href="/workout"
      className="bg-accent text-accent-foreground fixed inset-x-4 bottom-20 z-30 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg md:right-6 md:bottom-6 md:left-auto md:w-80"
    >
      <Dumbbell className="size-5" />
      <span className="flex-1 truncate font-medium">{workout.name}</span>
      <span className="font-semibold tabular-nums">
        {formatClock((now - Date.parse(workout.startedAt)) / 1000)}
      </span>
    </Link>
  );
}
