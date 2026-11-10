import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { syncStats } from "@/db/schema";

export type SyncChannel = "workout" | "outbox";

/**
 * Adds one to today's count for a sync outcome ("ok", "conflict", or a failure kind).
 * Never throws: a missed count must not fail the save it describes.
 */
export async function countSync(db: Database, channel: SyncChannel, outcome: string) {
  try {
    await db
      .insert(syncStats)
      .values({ day: sql`(now() at time zone 'utc')::date`, channel, outcome, count: 1 })
      .onConflictDoUpdate({
        target: [syncStats.day, syncStats.channel, syncStats.outcome],
        set: { count: sql`${syncStats.count} + 1` },
      });
  } catch {}
}
