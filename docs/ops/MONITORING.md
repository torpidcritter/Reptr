# Monitoring

What Reptr reports, where it goes, and what to watch during a closed beta (~100 people).
Finding P1-10.

## What the app emits

| Signal           | Where                                                                                              | How                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured logs  | Vercel → Logs (JSON lines: `ts`, `level`, `event`, fields)                                         | `src/lib/log.ts`. Personal data is never logged; account references are hashed.                                                             |
| Error alerts     | `ERROR_WEBHOOK_URL` (Slack, Discord or an error tracker)                                           | Every `log.error`. Sent with Next's `after()`, so a serverless function isn't frozen mid-send. At most one alert per event name per minute. |
| Slow requests    | logs, `event: "slow_request"` with `name`                                                          | `timed(name, fn, slowMs)` wraps `workout_save` (2 s), `outbox_op` (2 s) and `coach_answer` (20 s).                                          |
| Health           | `GET /api/health` → `200 {ok:true}` or `503`                                                       | Pings the database. Public, never cached.                                                                                                   |
| Coach spend      | `coach_usage` table; logs, `coach_blocked`                                                         | Tokens and estimated cost per answer, with outcome (answered, failed, timed_out, too_many_steps). Requests refused by a limit are logged.   |
| Sync problems    | logs, `workout_sync_conflict` (warn), `outbox_op_failed` and `workout_save_failed` (error → alert) | Kind and ids only.                                                                                                                          |
| Sign-in delivery | logs, `magic_link_failed` (error → alert when delivery failed)                                     | SMTP or provider problems. Bad addresses and rate limits are warnings.                                                                      |

## Set up (dashboard work, not done from the repo)

1. **Uptime check.** Any uptime service (Better Stack, UptimeRobot, Checkly) on
   `https://reptr-three.vercel.app/api/health` every 1 minute, alert after 2 failures.
2. **Error webhook.** Create a Slack or Discord incoming webhook for a private channel and
   set `ERROR_WEBHOOK_URL` in Vercel (Production only). Trigger a test by signing in with
   a bad code 9 times, which logs a rate-limit warning (not an alert), or by temporarily
   breaking `DATABASE_URL` on a preview deployment.
3. **Log retention.** Vercel Hobby keeps logs ~1 hour; Pro keeps longer and supports log
   drains. For the beta, Pro plus a log drain to Better Stack or Axiom is the simplest
   way to search past errors.
4. **Supabase.** Turn on email alerts for database CPU, disk and connection count
   (Project → Reports). The pooler limit on the current plan is the first ceiling.
5. **Sentry (optional).** Not installed. Worth adding if alerts become noisy or stack
   traces from the browser are needed; `ERROR_WEBHOOK_URL` can point at Sentry's
   ingest in the meantime.

Status: **not configured**. Nothing above has been set up or verified on the live project.

## Targets for the closed beta

| Measure                                      | Target         | Alert when                                      |
| -------------------------------------------- | -------------- | ----------------------------------------------- |
| `/api/health` availability                   | 99.5% / month  | 2 failed checks in a row                        |
| Workout save (`workout_save`) p95            | < 800 ms       | `slow_request` (over 2 s) more than 5× per hour |
| Quick log (`outbox_op`) p95                  | < 500 ms       | as above                                        |
| Error alerts                                 | < 5 / day      | any `log.error` (webhook)                       |
| Queued offline changes refused by the server | 0              | any `outbox_op_failed` with `kind: validation`  |
| Coach spend                                  | < $5 / day     | `coach_blocked` for the daily budget            |
| Supabase connections                         | < 60% of limit | Supabase alert                                  |

These are starting points, not measured baselines. Revisit after the first two weeks.

## Useful queries

```sql
-- Coach spend today, by outcome
select outcome, count(*), sum(cost_micros) / 1e6 as usd
from coach_usage where created_at > date_trunc('day', now()) group by 1;

-- People with changes the server refused and kept on device can't be seen here;
-- those stay on the device until the person retries or removes them.
```
