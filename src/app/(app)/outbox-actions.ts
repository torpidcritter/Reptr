"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { timed } from "@/lib/log";
import { applyOp, opPaths, opSchema, pruneAppliedOps } from "@/modules/ops/outbox";
import type { SyncFailure } from "@/modules/sync/errors";
import { failure } from "@/modules/sync/server";

export type OpResult = { ok: true } | SyncFailure;

/**
 * Applies one quick log, sent straight away or replayed from a device's offline queue.
 * `owner` is the account the device queued it under; an op queued by one account is
 * never applied to another, even on a shared device.
 */
export async function applyOpAction(op: unknown, owner?: string): Promise<OpResult> {
  const user = await requireUser();
  if (owner && owner !== user.id) {
    return { ok: false, kind: "forbidden", error: "This change was made under another account." };
  }
  const parsed = opSchema.safeParse(op);
  if (!parsed.success) {
    return { ok: false, kind: "validation", error: parsed.error.issues[0].message };
  }
  const busy = await overLimit(user.id, "write");
  if (busy) return { ok: false, kind: "rate_limited", error: busy };
  try {
    await timed("outbox_op", () => applyOp(db, user.id, parsed.data));
  } catch (e) {
    return failure("outbox_op_failed", e);
  }
  if (Math.random() < 0.02) await pruneAppliedOps(db, user.id).catch(() => {});
  for (const p of opPaths[parsed.data.kind]) revalidatePath(p);
  return { ok: true };
}
