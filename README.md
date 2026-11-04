# Reptr

A personal fitness app (installable PWA) that tracks workouts, strength progression, physique, nutrition and recovery, with an AI coach grounded in your own data.

## Development

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # unit tests (Vitest)
pnpm lint && pnpm typecheck && pnpm format:check
```

The build plan and task list live in the Reptr build spec. Weights, distances and times are stored in kg, metres and seconds and converted only for display (`src/lib/units`).

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the project URL, anon key and database connection string.
3. Run the migrations and load the exercise library:
   ```bash
   pnpm db:migrate   # use the direct connection string (port 5432)
   pnpm db:seed
   ```
4. In Supabase, go to **Authentication > URL Configuration**. Set **Site URL** to your app's URL and add `http://localhost:3000/auth/confirm` (plus your deployed URL + `/auth/confirm`) to **Redirect URLs**.

Sign-in uses email magic links. New sign-ups get a profile row automatically and are sent to onboarding.

Migrations also create the private `progress-photos` storage bucket with per-user folder policies, so progress photos work as soon as the app points at the project.

## AI coach

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4.1-mini`) in the server environment. The coach answers through tools that call Reptr's own analytics (`src/modules/coach/tools.ts`), so its numbers come from your data. Anything that would change data (creating a routine, logging a weight) comes back as a proposal the user has to confirm in the app. Chat history stays in the browser.

## Local data without Supabase

With a local Postgres and the Supabase shim (`src/db/test/supabase-shim.sql`), set `REPTR_DEV_USER_ID` to act as that user in `pnpm dev`, then fill it with ten weeks of realistic training, weigh-ins and check-ins:

```bash
pnpm db:demo <user-id>
```

## Deploying

Vercel works out of the box: add the environment variables from `.env.example`, use the pooled connection string (port 6543) for `DATABASE_URL`, and run `pnpm db:migrate` against the direct connection once per release that adds a migration. The app installs from the browser as a PWA; the service worker only registers in production builds.
