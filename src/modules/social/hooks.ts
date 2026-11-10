import type { Database } from "@/db/types";
import { onWorkoutChanged } from "@/modules/workouts/corrections";
import { refreshPostFor } from "./social";

// A corrected workout's post shows the corrected numbers. A deleted workout's post goes
// with it (foreign key cascade), so only corrections need this.
onWorkoutChanged(async (tx, userId, change) => {
  await refreshPostFor(tx as unknown as Database, userId, change.workoutId);
});
