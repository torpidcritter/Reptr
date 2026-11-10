# Supabase staging tests (P0-5)

`src/integration/supabase-staging.test.ts` runs against a real Supabase project that is
**not** production. It checks what local tests can't: real one-time link tokens, session
refresh, the storage policies on the `progress-photos` bucket, signed URLs, that one
user can't see or delete another's files, that deleting photos is confirmed by listing
the folder, that account deletion leaves nothing in storage, and that the Data API
doesn't leak rows.

## One-time setup

1. Create a second Supabase project, e.g. `reptr-staging`, in the same region
   (Singapore). Free plan is fine for staging.
2. Apply the migrations: `DATABASE_URL=<staging direct URL, port 5432> corepack pnpm db:migrate`.
   This also creates the private `progress-photos` bucket and its policies.
3. Set the same Auth settings as production (docs/ops/AUTH_EMAIL_SETUP.md); SMTP can
   stay on Supabase's sender for staging.
4. In GitHub → Settings → Secrets and variables → Actions, add:

   | Secret                              | From the staging project                            |
   | ----------------------------------- | --------------------------------------------------- |
   | `STAGING_SUPABASE_URL`              | Project Settings → API → URL                        |
   | `STAGING_SUPABASE_ANON_KEY`         | Project Settings → API → anon / publishable key     |
   | `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key           |
   | `STAGING_DATABASE_URL`              | Database → Connection string, session/direct (5432) |

## Running

- GitHub → Actions → "Supabase staging" → Run workflow. It also runs nightly once the
  secrets exist.
- Locally: export the four variables and run `corepack pnpm vitest run src/integration`.

Without the variables the suite is skipped and says so in the output; it never fails
silently and never touches production (it refuses a URL containing "prod").
