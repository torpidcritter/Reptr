"use server";

import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { equipmentList, muscles } from "@/db/seed/muscles";
import { listExercises, similarExercises } from "@/modules/exercises/queries";

export type PickerExercise = {
  id: string;
  name: string;
  detail: string;
  measurement: "weight_reps" | "reps" | "assisted_reps" | "time" | "distance_time";
};

/** Search used by the exercise picker in the routine builder and workout logger. */
export async function searchExercises(
  q: string,
  filters: { muscle?: string; equipment?: string } = {},
): Promise<PickerExercise[]> {
  const user = await requireUser();
  const muscle = muscles.some((m) => m.slug === filters.muscle) ? filters.muscle : undefined;
  const equipment = equipmentList.some((e) => e.slug === filters.equipment)
    ? filters.equipment
    : undefined;
  const rows = await listExercises(db, user.id, { q: q.slice(0, 80), muscle, equipment });
  return rows.slice(0, 40).map((e) => ({
    id: e.id,
    name: e.name,
    measurement: e.measurement,
    detail: [e.primaryMuscles.join(", "), e.equipment].filter(Boolean).join(" · "),
  }));
}

/** Swaps for an exercise that keep its training intent, best first. */
export async function similarExercisesAction(
  exerciseId: string,
): Promise<(PickerExercise & { reason: string })[]> {
  const user = await requireUser();
  const id = z.uuid().parse(exerciseId);
  const rows = await similarExercises(db, user.id, id);
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    measurement: e.measurement,
    reason: e.reason,
    detail: [e.primaryMuscles.join(", "), e.equipment].filter(Boolean).join(" · "),
  }));
}
