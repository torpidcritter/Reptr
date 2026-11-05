// Pure helpers for a multi-week training block: which week it is and what a deload changes.

import type { WorkoutSnapshot } from "@/modules/workouts/snapshot";

export type Block = { startDate: string; weeks: number; deloadEvery: number | null };
export type WeekKind = "build" | "deload";

const dayMs = 86400000;

/** The kind of each week, in order. A deload never lands on week 1. */
export function weekKinds(weeks: number, deloadEvery: number | null): WeekKind[] {
  return Array.from({ length: weeks }, (_, i) =>
    deloadEvery && (i + 1) % deloadEvery === 0 ? "deload" : "build",
  );
}

/** Where `today` falls in the block. */
export function blockWeek(block: Block, today: string) {
  const days = Math.floor(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${block.startDate}T00:00:00Z`)) / dayMs,
  );
  const kinds = weekKinds(block.weeks, block.deloadEvery);
  if (days < 0) return { status: "upcoming" as const, startsIn: -days, kinds };
  const week = Math.floor(days / 7) + 1;
  if (week > block.weeks) return { status: "finished" as const, kinds };
  return {
    status: "active" as const,
    week,
    kind: kinds[week - 1],
    nextDeload: kinds.indexOf("deload", week) + 1 || null,
    kinds,
  };
}

/** Round a weight down to a loadable step: 2.5 kg for barbell-sized loads, 0.5 kg below 20 kg. */
function loadable(kg: number) {
  const step = kg >= 20 ? 2.5 : 0.5;
  return Math.floor(kg / step + 1e-9) * step;
}

export const deloadNote =
  "Deload week: about half the sets at around 90% of the weight. Keep it easy.";

/** A deload version of a freshly started workout: half the sets (at least one), ~90% load. */
export function applyDeload(w: WorkoutSnapshot): WorkoutSnapshot {
  return {
    ...w,
    notes: w.notes ? `${deloadNote}\n${w.notes}` : deloadNote,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.slice(0, Math.max(1, Math.round(e.sets.length / 2))).map((s) => ({
        ...s,
        weightKg:
          s.weightKg != null && e.measurement === "weight_reps"
            ? loadable(s.weightKg * 0.9)
            : s.weightKg,
      })),
    })),
  };
}
