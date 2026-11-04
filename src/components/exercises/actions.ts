"use server";

import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { listExercises } from "@/modules/exercises/queries";

export type PickerExercise = {
  id: string;
  name: string;
  detail: string;
  measurement: "weight_reps" | "reps" | "assisted_reps" | "time" | "distance_time";
};

/** Search used by the exercise picker in the routine builder and workout logger. */
export async function searchExercises(q: string): Promise<PickerExercise[]> {
  const user = await requireUser();
  const rows = await listExercises(db, user.id, { q: q.slice(0, 80) });
  return rows.slice(0, 40).map((e) => ({
    id: e.id,
    name: e.name,
    measurement: e.measurement,
    detail: [e.primaryMuscles.join(", "), e.equipment].filter(Boolean).join(" · "),
  }));
}
