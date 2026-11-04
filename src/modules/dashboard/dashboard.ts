import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { routines, workouts } from "@/db/schema";
import type { Database } from "@/db/types";

/** The routine due next: never done first, then the one done longest ago. */
export async function nextRoutine(db: Database, userId: string) {
  const last = sql<Date | null>`max(${workouts.finishedAt})`;
  const [row] = await db
    .select({ id: routines.id, name: routines.name, lastDone: last })
    .from(routines)
    .leftJoin(workouts, and(eq(workouts.routineId, routines.id), eq(workouts.status, "completed")))
    .where(and(eq(routines.userId, userId), isNull(routines.archivedAt)))
    .groupBy(routines.id)
    .orderBy(sql`${last} asc nulls first`, desc(routines.createdAt))
    .limit(1);
  return row ? { ...row, lastDone: row.lastDone ? new Date(row.lastDone) : null } : null;
}

/** Weeks in a row (counting back from this week, or last week if this one is empty) with a workout. */
export function weekStreak(workoutsPerWeek: number[]) {
  const w = [...workoutsPerWeek];
  if (w.length && w[w.length - 1] === 0) w.pop();
  let n = 0;
  for (let i = w.length - 1; i >= 0 && w[i] > 0; i--) n++;
  return n;
}
