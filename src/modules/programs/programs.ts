import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { programs } from "@/db/schema";
import type { Database } from "@/db/types";
import { weekOf } from "@/modules/analytics/insights";

export const programSchema = z.object({
  name: z.string().trim().min(1, "Give the block a name.").max(80),
  startDate: z.iso.date("Pick a start date."),
  weeks: z.coerce.number().int().min(2, "At least 2 weeks.").max(16, "At most 16 weeks."),
  deloadEvery: z.preprocess(
    (v) => (v === "" || v == null || v === "0" ? null : v),
    z.coerce.number().int().min(3).max(8).nullable(),
  ),
});
export type ProgramInput = z.infer<typeof programSchema>;

/** Starts a block, ending any active one. Blocks start on the Monday of the chosen week. */
export async function startProgram(db: Database, userId: string, input: ProgramInput) {
  return db.transaction(async (tx) => {
    await tx
      .update(programs)
      .set({ archivedAt: new Date() })
      .where(and(eq(programs.userId, userId), isNull(programs.archivedAt)));
    const [row] = await tx
      .insert(programs)
      .values({ ...input, userId, startDate: weekOf(input.startDate) })
      .returning({ id: programs.id });
    return row;
  });
}

export async function endProgram(db: Database, userId: string) {
  await db
    .update(programs)
    .set({ archivedAt: new Date() })
    .where(and(eq(programs.userId, userId), isNull(programs.archivedAt)));
}

export async function activeProgram(db: Database, userId: string) {
  const [row] = await db
    .select({
      id: programs.id,
      name: programs.name,
      startDate: programs.startDate,
      weeks: programs.weeks,
      deloadEvery: programs.deloadEvery,
    })
    .from(programs)
    .where(and(eq(programs.userId, userId), isNull(programs.archivedAt)));
  return row ?? null;
}
