import { z } from "zod";
import type { Database } from "@/db/types";
import { programSchema, startProgram } from "@/modules/programs/programs";
import { routineSchema, saveRoutine } from "@/modules/routines/routines";

export const programProposalSchema = z.object({
  name: z.string(),
  weeks: z.number(),
  deloadEvery: z.number().nullable(),
  routines: z
    .array(
      z.object({
        name: z.string(),
        scheduleDays: z.array(z.number()),
        items: z.array(
          z.object({
            exerciseId: z.uuid(),
            targetSets: z.number(),
            targetRepsMin: z.number(),
            targetRepsMax: z.number(),
            restSeconds: z.number().nullable(),
          }),
        ),
      }),
    )
    .min(1)
    .max(7),
});

/**
 * Saves a confirmed program: its routines with their weekdays, then a training block
 * starting this week. Everything is validated before anything is written.
 */
export async function applyProgram(
  db: Database,
  userId: string,
  payload: z.infer<typeof programProposalSchema>,
  today: string,
) {
  const routines = payload.routines.map((r) =>
    routineSchema.parse({
      name: r.name,
      scheduleDays: r.scheduleDays,
      items: r.items.map((i) => ({ ...i, supersetGroup: null })),
    }),
  );
  const block = programSchema.parse({
    name: payload.name,
    startDate: today,
    weeks: payload.weeks,
    deloadEvery: payload.deloadEvery,
  });
  for (const r of routines) await saveRoutine(db, userId, r);
  await startProgram(db, userId, block);
  return { routines: routines.length, block };
}
