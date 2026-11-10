# Deployment

How Reptr ships to Vercel, the settings it depends on, and how an update reaches a
device that is mid-workout.

## Pipeline

1. A pull request runs CI (`.github/workflows/ci.yml`): format, lint, typecheck, unit
   and database tests against a fresh Postgres, build, and the Playwright journeys.
2. Merging to `main` deploys to production on Vercel.
3. Database migrations are **not** applied by the deploy. Apply them by hand, in the
   order below, from a machine with the production database URL (session pooler or
   direct connection, **port 5432**; the scripts refuse 6543).

## Production upgrade order

Rule: **never deploy code that needs a migration the database doesn't have.** Every
migration here is additive, so applying one before its code ships is safe for the old
code. The reverse is what breaks a live app.

| Step | Do                                                                                                       | Check                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Take a backup: Supabase daily backup or PITR (Pro), plus `scripts/ops/backup-db.sh` for an off-site copy | The backup exists and is more than 1 KB; note its time                                                                             |
| 2    | `pnpm db:status`                                                                                         | Lists every migration as `applied` or `pending`, with no `problems`. Stop if any migration shows as edited or missing its objects  |
| 3    | `pnpm db:migrate:to 0028` then the same with `--yes`                                                     | The first run lists exactly what it will apply. Afterwards `db:status` shows 0020 to 0028 applied                                  |
| 4    | Smoke test the live app (code from PRs #49 to #52)                                                       | Sign in, log a set, finish a workout, open Progress, Social and your profile; `/api/health` returns ok                             |
| 5    | `pnpm db:migrate:to 0031 --yes`                                                                          | `db:status` shows 0 pending. The live app keeps working: the new tables are unused until step 6                                    |
| 6    | Merge PR #53; Vercel deploys it                                                                          | The deployment is Ready                                                                                                            |
| 7    | Smoke test Stage E                                                                                       | Leaderboards, Challenges (the seasonal challenge appears), Groups, Notifications; finish a workout and see your XP on Achievements |

If step 4 or 7 fails: promote the previous deployment in Vercel (Rollback, below) and
keep the migrations, which the old code ignores. A migration that fails halfway: see
`BACKUP_AND_RECOVERY.md` section 4C.

For later releases the same pattern holds: `db:status`, then `db:migrate:to <newest>`,
then merge.

## Vercel settings

| Setting                                  | Value                                        | Why                                                                                                                        | Status                                                                           |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Function region                          | `sin1` (from `vercel.json`)                  | Same region as the Supabase database (Singapore). Each query otherwise crosses an ocean.                                   | In repo; **verify on the next deploy** (Deployment → Functions shows the region) |
| Skew Protection                          | On (Settings → Advanced), max age ≥ 12 hours | Keeps the previous build's server actions answering for tabs opened before a deploy, so a phone mid-workout keeps syncing. | **Not set** (needs Pro)                                                          |
| `NEXT_PUBLIC_SITE_URL`                   | `https://reptr-three.vercel.app`             | Sign-in links and redirects never come from request headers.                                                               | **Not verified**                                                                 |
| `DATABASE_URL`                           | transaction pooler, port 6543                | See `DATABASE_SECURITY.md`.                                                                                                | Set                                                                              |
| `NEXT_PUBLIC_SUPABASE_URL`, `…_ANON_KEY` | project values                               |                                                                                                                            | Set                                                                              |
| `ERROR_WEBHOOK_URL`                      | a private channel webhook                    | See `MONITORING.md`.                                                                                                       | **Not set**                                                                      |
| `OPENAI_API_KEY`, `COACH_*`              | optional                                     | Coach is off without a key.                                                                                                | Not set                                                                          |

## Updates and devices that are mid-workout

Two layers keep a deploy from losing sets:

1. **Skew Protection** (Vercel). Requests from an old page are routed to the old build
   for its max age, so its server actions keep working. This is the main protection and
   is a dashboard setting.
2. **Stale-build detection** (in the app, finding P1-3). If an old page calls a server
   action the new build doesn't have, Next throws "Failed to find Server Action". The
   syncers classify that as `stale_build`, stop sending, keep everything in IndexedDB,
   and show "Reptr was updated" with a Reload button. The reload is safe: device data
   is per account and reloads from IndexedDB. Covered by `src/modules/sync/errors.test.ts`.

The service worker (`public/sw.js?v=<build>`) installs the new version in the
background and only activates it when no workout is in progress on that device.

## Rollback

Vercel → Deployments → previous deployment → Promote to Production. Migrations are
additive, so the previous code runs against the newer schema. If a migration itself
must be reverted, write a new migration that undoes it; never edit an applied one.
