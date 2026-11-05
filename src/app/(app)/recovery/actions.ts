"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { overLimit } from "@/lib/guard";
import { requireUser } from "@/lib/auth";
import { checkinSchema, saveCheckin } from "@/modules/recovery/recovery";

export async function saveCheckinAction(payload: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const parsed = checkinSchema.safeParse(payload);
  if (!parsed.success)
    return {
      error:
        "Check the numbers: sleep 0–24 h, steps up to 200,000, resting HR 25–200, HRV 5–300 ms.",
    };
  await saveCheckin(db, user.id, parsed.data);
  revalidatePath("/recovery");
  revalidatePath("/");
  return {};
}
