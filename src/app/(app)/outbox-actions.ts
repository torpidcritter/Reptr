"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { applyOp, opPaths, opSchema, pruneAppliedOps } from "@/modules/ops/outbox";

export type OpResult = { ok: true } | { ok: false; error: string; retry?: boolean };

/** Applies one quick log, sent straight away or replayed from a device's offline queue. */
export async function applyOpAction(op: unknown): Promise<OpResult> {
  const user = await requireUser();
  const parsed = opSchema.safeParse(op);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, error: busy, retry: true };
  await applyOp(db, user.id, parsed.data);
  if (Math.random() < 0.02) await pruneAppliedOps(db, user.id);
  for (const p of opPaths[parsed.data.kind]) revalidatePath(p);
  return { ok: true };
}
