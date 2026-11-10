import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { challengeMembers, challenges } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { myProfile, refused, SocialError, type ProfileCard } from "@/modules/social/social";

// Challenges: one metric between two UTC dates, optionally with a target. Standings come
// from public.challenge_board(), scored from saved workouts like the leaderboards.

import {
  challengeKinds,
  metrics,
  type ChallengeVisibility,
  type Metric,
} from "./challenge-options";

export { challengeKinds, metrics, type ChallengeVisibility, type Metric };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const todayUtc = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000;

export const challengeSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the challenge a title of at least 3 characters.")
      .max(60, "Keep the title under 60 characters."),
    description: z
      .string()
      .trim()
      .max(280, "Keep the description under 280 characters.")
      .default(""),
    metric: z.enum(Object.keys(metrics) as [Metric, ...Metric[]]),
    target: z.number().positive().max(10_000_000).nullable().default(null),
    visibility: z.enum(
      Object.keys(challengeKinds) as [ChallengeVisibility, ...ChallengeVisibility[]],
    ),
    groupId: z.uuid().nullable().default(null),
    startsOn: day,
    endsOn: day,
  })
  .refine((c) => daysBetween(c.startsOn, c.endsOn) >= 0, {
    message: "The end date must be on or after the start.",
    path: ["endsOn"],
  })
  .refine((c) => daysBetween(c.startsOn, c.endsOn) <= 92, {
    message: "A challenge can last up to 3 months.",
    path: ["endsOn"],
  })
  .refine((c) => c.endsOn >= todayUtc(), {
    message: "The end date has already passed.",
    path: ["endsOn"],
  })
  .refine((c) => (c.visibility === "group") === Boolean(c.groupId), {
    message: "Pick the group this challenge is for.",
    path: ["groupId"],
  });
export type ChallengeInput = z.input<typeof challengeSchema>;

export async function createChallenge(db: Database, me: string, input: ChallengeInput) {
  const c = challengeSchema.parse(input);
  if (!(await myProfile(db, me))) throw new SocialError("Set up your social profile first.");
  try {
    return await withUser(db, me, async (tx) => {
      const [row] = await tx
        .insert(challenges)
        .values({
          creatorId: me,
          groupId: c.groupId,
          title: c.title,
          description: c.description || null,
          metric: c.metric,
          target: c.target,
          visibility: c.visibility,
          startsOn: c.startsOn,
          endsOn: c.endsOn,
        })
        .returning({ id: challenges.id });
      await tx.insert(challengeMembers).values({ challengeId: row.id, userId: me });
      return row.id;
    });
  } catch (e) {
    if (refused(e))
      throw new SocialError("You can only make group challenges for your own groups.");
    throw e;
  }
}

export async function deleteChallenge(db: Database, me: string, id: string) {
  const rows = await withUser(db, me, (tx) =>
    tx
      .delete(challenges)
      .where(and(eq(challenges.id, id), eq(challenges.creatorId, me)))
      .returning({ id: challenges.id }),
  );
  if (!rows.length) throw new SocialError("Only the person who made it can delete it.");
}

export async function joinChallenge(db: Database, me: string, id: string) {
  if (!(await myProfile(db, me))) throw new SocialError("Set up your social profile first.");
  try {
    await withUser(db, me, (tx) =>
      tx.insert(challengeMembers).values({ challengeId: id, userId: me }).onConflictDoNothing(),
    );
  } catch (e) {
    if (refused(e)) throw new SocialError("You can't join this challenge.");
    throw e;
  }
}

export async function leaveChallenge(db: Database, me: string, id: string) {
  await withUser(db, me, (tx) =>
    tx
      .delete(challengeMembers)
      .where(and(eq(challengeMembers.challengeId, id), eq(challengeMembers.userId, me))),
  );
}

export type ChallengeSummary = {
  id: string;
  title: string;
  description: string | null;
  metric: Metric;
  target: number | null;
  visibility: ChallengeVisibility;
  startsOn: string;
  endsOn: string;
  seasonal: boolean;
  creatorId: string | null;
  groupId: string | null;
  groupName: string | null;
  participants: number;
  joined: boolean;
  completed: boolean;
  /** The person's own score, for challenges they're in. */
  myScore: number | null;
};

const summaryColumns = sql`c.id, c.title, c.description, c.metric, c.target::float8 as target,
  c.visibility, c.starts_on::text as "startsOn", c.ends_on::text as "endsOn",
  (c.season_key is not null) as seasonal, c.creator_id as "creatorId", c.group_id as "groupId",
  g.name as "groupName",
  (select count(*)::int from public.challenge_members m where m.challenge_id = c.id) as participants,
  exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = (select auth.uid())) as joined,
  exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = (select auth.uid()) and m.completed_at is not null) as completed`;

/** Challenges the person is in (newest first), and open ones they could join. */
export async function listChallenges(db: Database, me: string) {
  return withUser(db, me, async (tx) => {
    const mine = await tx.execute<ChallengeSummary>(sql`
      select ${summaryColumns},
        (select b.score::float8 from public.challenge_board(c.id) b where b.user_id = ${me}) as "myScore"
      from public.challenges c
      left join public.groups g on g.id = c.group_id
      where exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = ${me})
      order by (c.ends_on >= (now() at time zone 'UTC')::date) desc, c.ends_on desc
      limit 50`);
    const open = await tx.execute<ChallengeSummary>(sql`
      select ${summaryColumns}, null::float8 as "myScore" from public.challenges c
      left join public.groups g on g.id = c.group_id
      where c.ends_on >= (now() at time zone 'UTC')::date
        and not exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = ${me})
        and c.visibility <> 'only_me'
      order by (c.season_key is not null) desc, participants desc, c.ends_on
      limit 30`);
    return { mine, open };
  });
}

export type Standing = {
  rank: number;
  score: number;
  completed: boolean;
  me: boolean;
  person: ProfileCard;
};

export async function getChallenge(db: Database, me: string, id: string) {
  return withUser(db, me, async (tx) => {
    const [c] = await tx.execute<ChallengeSummary>(sql`
      select ${summaryColumns}, null::float8 as "myScore" from public.challenges c
      left join public.groups g on g.id = c.group_id
      where c.id = ${id}`);
    if (!c) return null;
    const rows = await tx.execute<
      ProfileCard & { rank: string; score: string; completed_at: string | null }
    >(sql`
      select b.rank, b.score, b.completed_at, p.user_id as "userId", p.handle,
             p.display_name as "displayName", p.bio, p.avatar_path as "avatarPath", p.visibility
      from public.challenge_board(${id}) b
      join public.profile_cards p on p.user_id = b.user_id
      order by b.rank, p.handle
      limit 500`);
    const standings = rows.map((r): Standing => ({
      rank: Number(r.rank),
      score: Number(r.score),
      completed: r.completed_at !== null,
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
    return { challenge: c, standings };
  });
}

const monthName = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(d);

/**
 * Makes sure this month's seasonal challenge exists. Idempotent: one per season key, so
 * any number of calls (or servers) create it once.
 */
export async function ensureSeasonal(db: Database, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const key = `${y}-${String(m + 1).padStart(2, "0")}-workouts`;
  await db
    .insert(challenges)
    .values({
      creatorId: null,
      title: `${monthName(start)} consistency`,
      description: "Finish 12 workouts this month. Everyone's welcome.",
      metric: "workouts",
      target: 12,
      visibility: "public",
      startsOn: start.toISOString().slice(0, 10),
      endsOn: end.toISOString().slice(0, 10),
      seasonKey: key,
    })
    .onConflictDoNothing();
}
