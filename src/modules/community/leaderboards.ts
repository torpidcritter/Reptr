import { and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { exercises } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import type { ProfileCard } from "@/modules/social/social";
import { exerciseBoardSlugs, isBaseCategory, periodRange, periods, type Period } from "./scoring";

// Leaderboards, read through public.leaderboard(), which works out who the signed-in
// person may see and scores everyone from saved workouts. Nothing here takes a score
// from the client.

export const boardScopes = ["friends", "global", "group"] as const;
export type BoardScope = (typeof boardScopes)[number];

export const boardQuerySchema = z.object({
  category: z
    .string()
    .refine(
      (c) => isBaseCategory(c) || /^e1rm:[0-9a-f-]{36}$/i.test(c),
      "That leaderboard doesn't exist.",
    ),
  period: z.enum(periods),
  scope: z.enum(boardScopes),
  groupId: z.uuid().optional(),
});
export type BoardQuery = z.input<typeof boardQuerySchema>;

export type BoardRow = { rank: number; score: number; me: boolean; person: ProfileCard };

export const BOARD_SIZE = 100;

export async function leaderboard(db: Database, me: string, query: BoardQuery) {
  const q = boardQuerySchema.parse(query);
  if (q.scope === "group" && !q.groupId) return [];
  // A streak is always the current one, whatever the period.
  const { from, to } = periodRange(q.category === "streak" ? "all" : (q.period as Period));
  const rows = await withUser(db, me, (tx) =>
    tx.execute<ProfileCard & { rank: string; score: string }>(sql`
      select l.rank, l.score, c.user_id as "userId", c.handle, c.display_name as "displayName",
             c.bio, c.avatar_path as "avatarPath", c.visibility
      from public.leaderboard(${q.category}, ${from.toISOString()}, ${to.toISOString()},
                              ${q.scope}, ${q.groupId ?? null}, ${BOARD_SIZE}) l
      join public.profile_cards c on c.user_id = l.user_id
      order by l.rank, c.handle`),
  );
  return rows.map((r): BoardRow => ({
    rank: Number(r.rank),
    score: Number(r.score),
    me: r.userId === me,
    person: {
      userId: r.userId,
      handle: r.handle,
      displayName: r.displayName,
      bio: r.bio,
      avatarPath: r.avatarPath,
      visibility: r.visibility,
    },
  }));
}

/** The library exercises that have their own board. */
export async function exerciseBoards(db: Database) {
  const rows = await db
    .select({ id: exercises.id, slug: exercises.slug, name: exercises.name })
    .from(exercises)
    .where(and(isNull(exercises.ownerId), inArray(exercises.slug, [...exerciseBoardSlugs])));
  return exerciseBoardSlugs
    .map((s) => rows.find((r) => r.slug === s))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({ category: `e1rm:${r.id}`, name: r.name }));
}
