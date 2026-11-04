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
