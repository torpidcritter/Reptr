import { and, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { appliedOps } from "@/db/schema";
import { entrySchema, logEntry } from "@/modules/body/body";
import { addFood, addWater, foodSchema } from "@/modules/nutrition/nutrition";
import { checkinSchema, saveCheckin } from "@/modules/recovery/recovery";
import { OP_RETENTION_DAYS } from "./retention";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The quick logs that can be made offline and replayed later. */
export const opSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.uuid(), kind: z.literal("food"), payload: foodSchema }),
  z.object({
    id: z.uuid(),
    kind: z.literal("water"),
    payload: z.object({ day, ml: z.number().int().min(-5000).max(5000) }),
  }),
  z.object({ id: z.uuid(), kind: z.literal("checkin"), payload: checkinSchema }),
  z.object({ id: z.uuid(), kind: z.literal("body"), payload: entrySchema }),
]);

export type Op = z.infer<typeof opSchema>;
export type OpKind = Op["kind"];

/** Pages to refresh after each kind of change. */
export const opPaths: Record<OpKind, string[]> = {
  food: ["/nutrition", "/"],
  water: ["/nutrition", "/"],
  checkin: ["/recovery", "/"],
  body: ["/physique", "/"],
};

/**
 * Applies a change once. The op id is recorded in the same transaction as the change,
 * so a repeat of an op that already went through is a no-op.
 */
export async function applyOp(db: Database, userId: string, op: Op, timeZone = "UTC") {
  return db.transaction(async (tx) => {
    const fresh = await tx
      .insert(appliedOps)
      .values({ userId, opId: op.id, kind: op.kind })
      .onConflictDoNothing()
      .returning({ opId: appliedOps.opId });
    if (!fresh.length) return { duplicate: true };
    // The module functions only use the query builder, which a transaction has too.
    const t = tx as unknown as Database;
    if (op.kind === "food") await addFood(t, userId, op.payload);
    else if (op.kind === "water") await addWater(t, userId, op.payload.day, op.payload.ml);
    else if (op.kind === "checkin") await saveCheckin(t, userId, op.payload);
    else await logEntry(t, userId, op.payload, timeZone);
    return { duplicate: false };
  });
}

/** Forgets op ids older than the retention window. */
export async function pruneAppliedOps(db: Database, userId: string) {
  await db
    .delete(appliedOps)
    .where(
      and(
        sql`${appliedOps.userId} = ${userId}`,
        lt(appliedOps.createdAt, sql`now() - make_interval(days => ${OP_RETENTION_DAYS})`),
      ),
    );
}
