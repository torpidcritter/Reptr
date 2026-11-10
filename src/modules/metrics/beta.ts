import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { isModerator, NotModeratorError } from "@/modules/community/moderation";

// Numbers for running the beta: whether people come back, train, compete and connect,
// and whether syncing works. Counts only, never anyone's training. Moderators only.
// Accounts are dated by their profile, which is created at sign-up.

export type RetentionRow = { day: number; cohort: number; retained: number };
export type WeekRow = { weekStart: string; activeUsers: number; workouts: number };
export type SyncRow = { channel: string; ok: number; conflicts: number; failed: number };

export type BetaMetrics = {
  accounts: number;
  newThisWeek: number;
  weeklyActive: number;
  weeks: WeekRow[];
  retention: RetentionRow[];
  socialProfiles: number;
  onLeaderboards: number;
  followsPerProfile: number;
  inRunningChallenge: number;
  challengeCompletions30d: number;
  sync: SyncRow[];
};

const n = (v: unknown) => Number(v ?? 0);

export async function betaMetrics(db: Database, moderator: string): Promise<BetaMetrics> {
  if (!isModerator(moderator)) throw new NotModeratorError();

  const [totals] = await db.execute<Record<string, string>>(sql`
    select
      (select count(*) from public.profiles) as accounts,
      (select count(*) from public.profiles where created_at >= now() - interval '7 days') as new_week,
      (select count(distinct user_id) from public.workouts
        where status = 'completed' and finished_at >= now() - interval '7 days') as wau,
      (select count(*) from public.social_profiles) as social,
      (select count(*) from public.social_profiles where leaderboards) as boards,
      (select count(*) from public.follows) as follows,
      (select count(distinct m.user_id) from public.challenge_members m
        join public.challenges c on c.id = m.challenge_id
        where (now() at time zone 'utc')::date between c.starts_on and c.ends_on
          and m.user_id in (select user_id from public.workouts
                            where status = 'completed' and finished_at >= now() - interval '7 days')) as in_challenge,
      (select count(*) from public.challenge_members
        where completed_at >= now() - interval '30 days') as completions`);

  // The last four full UTC weeks plus this one, Monday first.
  const weeks = await db.execute<{ week: string; active: string; workouts: string }>(sql`
    select to_char(wk, 'YYYY-MM-DD') as week,
           count(distinct w.user_id) as active, count(w.id) as workouts
    from generate_series(date_trunc('week', now() at time zone 'utc') - interval '4 weeks',
                         date_trunc('week', now() at time zone 'utc'), interval '1 week') wk
    left join public.workouts w on w.status = 'completed'
      and w.finished_at >= wk at time zone 'utc' and w.finished_at < (wk + interval '1 week') at time zone 'utc'
    group by wk order by wk`);

  // Of the people who signed up 1, 7 or 30+ days ago (within the last 90 days), how many
  // finished a workout on or after that day.
  const retention = await db.execute<{ day: number; cohort: string; retained: string }>(sql`
    select d.day, count(p.user_id) as cohort,
           count(p.user_id) filter (where exists (
             select 1 from public.workouts w where w.user_id = p.user_id and w.status = 'completed'
               and w.finished_at >= p.created_at + make_interval(days => d.day))) as retained
    from (values (1), (7), (30)) d(day)
    left join public.profiles p on p.created_at <= now() - make_interval(days => d.day)
      and p.created_at >= now() - interval '90 days'
    group by d.day order by d.day`);

  const sync = await db.execute<{
    channel: string;
    ok: string;
    conflicts: string;
    failed: string;
  }>(sql`
    select channel,
           coalesce(sum(count) filter (where outcome = 'ok'), 0) as ok,
           coalesce(sum(count) filter (where outcome = 'conflict'), 0) as conflicts,
           coalesce(sum(count) filter (where outcome not in ('ok', 'conflict')), 0) as failed
    from public.sync_stats where day >= (now() at time zone 'utc')::date - 6
    group by channel order by channel`);

  const social = n(totals.social);
  return {
    accounts: n(totals.accounts),
    newThisWeek: n(totals.new_week),
    weeklyActive: n(totals.wau),
    weeks: weeks.map((w) => ({
      weekStart: w.week,
      activeUsers: n(w.active),
      workouts: n(w.workouts),
    })),
    retention: retention.map((r) => ({ day: r.day, cohort: n(r.cohort), retained: n(r.retained) })),
    socialProfiles: social,
    onLeaderboards: n(totals.boards),
    followsPerProfile: social ? n(totals.follows) / social : 0,
    inRunningChallenge: n(totals.in_challenge),
    challengeCompletions30d: n(totals.completions),
    sync: sync.map((s) => ({
      channel: s.channel,
      ok: n(s.ok),
      conflicts: n(s.conflicts),
      failed: n(s.failed),
    })),
  };
}
