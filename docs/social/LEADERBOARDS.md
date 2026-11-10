# Leaderboards, challenges, groups, XP, notifications and moderation

Stage E builds competition and community on top of the social foundation in [SOCIAL.md](SOCIAL.md). This page covers:

- how scores are worked out, and why a client can't fake them;
- who sees what;
- what each feature does;
- what still needs setting up outside the code.

## Scoring rules

All scoring runs in Postgres (migration `0029_community_functions.sql`), from saved workouts only. The app never stores or accepts a score from a device. The rules are also shown to people at `/leaderboards/rules`. Keep that page, this file and the SQL in step.

### What counts

A workout counts when all of these hold:

- it is `completed`;
- it lasted between 5 minutes and 6 hours;
- the server first saved it no more than 7 days after it finished. This stops backfilling a past week to win it. Offline sync normally lands well within that window.

A set inside a counted workout counts when all of these hold:

- it is done (`completed_at` is set);
- it is not a warm-up;
- its weight is 0 to 500 kg;
- it has 0 to 100 reps;
- it lasted no more than 4 hours.

Sets that fail these checks are simply left out of scores. They stay in the person's own history.

### Categories

| Category             | Score                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `streak` (default)   | See below. Shown first, so the default board rewards consistency rather than strength                                                |
| `workouts`           | Number of counted workouts                                                                                                           |
| `records`            | Personal records set in counted sets, at most 5 per workout (migration 0033). Progress against yourself, so beginners can win        |
| `volume`             | Sum of weight × reps over counted sets                                                                                               |
| `sets`               | Number of counted sets                                                                                                               |
| `minutes`            | Workout length in minutes, capped at 240 each                                                                                        |
| `xp`                 | Per workout: 50, plus 2 per counted set (max 50), plus 10 per personal record set in it (max 50)                                     |
| `streak`             | Consecutive UTC weeks (Monday start) with a counted workout, ending this week or last week. Uses window functions (gaps and islands) |
| `e1rm:<exercise id>` | Best Epley estimated 1RM, from sets of 1 to 12 reps. Boards exist for bench press, back squat, deadlift and overhead press           |

### Periods and ranking

- **Periods:** this week, this month, or all time. They are in UTC, so everyone on a board is measured over the same instants.
- **Ranking:** `rank()`, so ties share a place. Only scores above 0 are listed. A board shows the top 100.
- **Levels:** reaching level _n_ takes 125 × _n_ × (_n_ − 1) XP in total (250, 750, 1500, 2500 and so on).
- **Unit tests:** `src/modules/community/scoring.ts` holds the level formula and the period bounds, and they are unit tested.

### Why a client can't cheat the numbers

- **Scores are derived, never stored from a client.** They come from workouts and sets that went through the normal workout validation.
- **Signed-in people can't run the raw scoring functions.** `fitness_workouts`, `fitness_scores` and `fitness_streaks` take any list of people, so they are not granted to them. People get `leaderboard()` and `challenge_board()`, which work out who the caller may see from `auth.uid()`.
- **Awards are server-only.** `user_badges`, `user_levels`, `notifications`, `social_sanctions` and `moderation_log` have no insert policy for signed-in users, and migration 0031 also revokes those privileges.
- **Implausible data is left out:**
  - sets heavier than 500 kg or with more than 100 reps;
  - workouts shorter than 5 minutes or longer than 6 hours;
  - workouts backfilled more than 7 days late.
- **Moderators are the backstop.** Anything that passes the checks but looks wrong can be reported with the "Fake or impossible numbers" reason. A moderator can then keep that account off boards and challenges.
- **Unusual activity list.** `/admin/reports` also lists people on boards or in challenges whose last one or two weeks are far beyond their own history (`activityFlags` in `moderation.ts`): more than 14 counted workouts in 7 days, a week's volume over 3 times their usual and over 10 tonnes, or a best lift over 25% above their previous best. A flag is a prompt to look, never an automatic sanction.

## Who sees what

- **Global boards ("Everyone"):** people who switched on "Show me on leaderboards" and whose profile the viewer can see. That means public accounts, private accounts the viewer follows, and the viewer themselves. Blocked and suspended people never appear.
- **Friends boards:** the viewer plus the people they follow, with the same conditions.
- **Group boards:** members of a group the viewer belongs to who are on leaderboards.
- **Challenge standings:** everyone who joined, shown to anyone who can see the challenge. Joining is the consent, and the join button says so.
- **Opt-in:** leaderboards are off by default in the database. The profile form pre-ticks the box for a new profile, so it's an explicit, visible choice.

## Features

### Challenges (`/challenges`)

- Each challenge has one metric (workouts, volume, sets or minutes), an optional target, and UTC start and end dates up to 92 days apart.
- **Who can see and join it:**
  - just me (individual);
  - my followers (friends);
  - a group;
  - anyone (public).
- **Seasonal challenges:** one public challenge per month ("November consistency: 12 workouts"). It is created idempotently on first visit, using a unique `season_key`.
- **Completion:** when someone reaches the target, they are marked complete and notified once.

### Groups (`/groups`)

- **Joining:** public groups can be found and joined by anyone. Private groups are joined with an invite code through `group_join(code)`, a SECURITY DEFINER function.
- **Roles:** the owner is added by a trigger when the group is created. Owners and admins can edit the group, renew the code and remove members. Owners can't leave; they delete the group instead.
- **Protected columns:** `owner_id` can't be changed through the Data API. Signed-in people only have UPDATE on the name, description, visibility and invite code.
- **Extras:** each group has its own leaderboard and can host group challenges.

### XP, levels, badges and streaks (`/achievements`)

- **`syncAwards`:**
  - runs after a workout finishes, after a correction or deletion, and when achievements are opened;
  - is idempotent: badges are stored once per (person, badge), and the level is cached in `user_levels` so a level-up is noticed once;
  - tells people only about badges reached in the last 7 days, so an existing account isn't flooded on its first sync.
- **Badges:** the existing milestones (workout counts, tonnes lifted, weekly streaks), computed from counted workouts.
- **Kept once earned:** badges stay even if the workout that earned them is later deleted.

### Notifications (`/notifications`, bell in every header)

- **Events:**
  - follows, follow requests, accepted requests;
  - likes, comments, replies;
  - finished challenges, badges, level-ups;
  - people joining your group.
- **Written by the server only.** Each notification is skipped when it is about yourself, when the kind is muted, or when either person has blocked the other.
- **Deduplication:** a key per event, so like, unlike and like again notifies once.
- **Retention:** notifications older than 90 days are pruned when the list is opened.
- **Content:** a notification never contains training data, only who did what and a link.
- **Push:** Web Push through `web-push`, with VAPID keys. It is off until the keys are set. A person opts in per device from the notification settings. Devices that are gone (404 or 410) are forgotten. The service worker opens a new window on tap, so it never steers away from a workout in progress.

### Moderation (`/admin/reports`)

- **Who:** moderators are the user ids in `REPTR_MODERATOR_IDS`. For anyone else the page is a 404, and the actions refuse.
- **The queue:** open reports, oldest first, each with:
  - the snapshot taken when it was reported;
  - how many reports the account has;
  - its current sanctions.
- **Decisions:**
  - dismiss;
  - remove the post or comment;
  - keep the account off boards (or put it back);
  - suspend (or lift a suspension).
- **Suspension:** a suspended account disappears from profile cards, search, feeds, posts, challenges and boards for everyone else. The `social_can_see`, `social_can_see_post` and `profile_cards` rules handle this.
- **Record keeping:** every decision is written to `moderation_log` and closes the report. Moderator actions are rate limited.
- **Without a report:** the sanctions list and the unusual activity list act on an account directly (suspend, lift, keep off or put back on boards). These are logged with no report.
- **Beta metrics** (`/admin/metrics`, moderators only): accounts, weekly active, workouts per active person, D1/D7/D30 return rates, leaderboard and challenge participation, follows per profile, and sync outcomes from `sync_stats` (daily counts with no user ids).

## Migrations

| Migration                      | What it adds                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `0029_community_functions.sql` | Rule and scoring functions; suspension added to the visibility rules                                        |
| `0030_community_tables.sql`    | Tables, enums, indexes and RLS policies (generated by Drizzle). Adds `social_profiles.leaderboards`         |
| `0031_community_rules.sql`     | Group owner trigger, column-level grants, server-only writes, and `profile_cards` hiding suspended accounts |
| `0032_beta_readiness.sql`      | `device_keys` (encrypts device data) and `sync_stats` (daily sync counts), both server only                 |
| `0033_progress_board.sql`      | The `records` board in `fitness_scores`; revokes client access to the two new tables                        |

## Tests

- `src/modules/community/scoring.test.ts`: levels, XP caps, UTC periods.
- `src/modules/community/community.test.ts` (10 database tests):
  - anti-cheat exclusions;
  - global and friends visibility, including private accounts;
  - lift and streak boards;
  - refusing raw scoring and award writes from signed-in users;
  - idempotent XP, badges and level-ups;
  - friend challenges and completion;
  - seasonal challenges;
  - private groups and invite codes, admin-only edits, and that `owner_id` can't be changed;
  - notification dedupe, mutes and blocks;
  - moderation permissions, keeping someone off boards, and suspension.
- `e2e/community.spec.ts`: two people and a moderator go through:
  - the leaderboard;
  - a private group joined by invite code, with its notification;
  - a group challenge with standings;
  - the seasonal challenge;
  - a report, a moderator decision, and the queue refusing anyone else.
- Export coverage includes every new table. Push subscriptions are left out on purpose, since they are device secrets.

## Set up outside the code

| What                                                                 | Where                        | Without it                                                            |
| -------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `REPTR_MODERATOR_IDS`                                                | Vercel environment variables | Nobody can work the report queue. Reports are still stored.           |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Vercel environment variables | No push. Notifications stay in the app, and the switch isn't offered. |

## Known limits

- **UTC periods.** Weeks and months are UTC, so for someone in Singapore a "week" starts at 08:00 on Monday. This is deliberate, so everyone is measured over the same time, and the rules page says so.
- **Computed on read.** Boards are worked out each time they are viewed, which is fine for a beta of about 100 people. If boards get slow, the next step is a periodic snapshot table, keeping the same functions.
- **The anti-cheat is rule-based.** It catches impossible numbers and backfilling, not someone steadily logging plausible but fake workouts. Reports and moderators cover that.
- **Flags are simple rules.** They catch sudden jumps, not someone who fakes slowly and steadily. Reports cover that.
