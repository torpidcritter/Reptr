# Backups and disaster recovery (P0-2)

**Status: NOT VERIFIED.** The scripts and procedure below exist in the repo. Nothing is
backed up until the configuration steps are done, and nothing counts as recoverable
until a restore drill (section 5) has passed and been recorded.

## 1. Targets

|                                | Target                                                       | Why                                                    |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| Recovery point (RPO), database | ≤ 24 h on Pro daily backups; ≤ 5 min with PITR               | A day of logs is the most a beta user should ever lose |
| Recovery point, photos         | ≤ 24 h                                                       | Nightly copy                                           |
| Recovery time (RTO)            | ≤ 4 h for a full restore                                     | One person on call, restore + checks                   |
| Retention                      | 7 days (Pro daily), 30 days for the encrypted off-site dumps | Catch a bad migration noticed a week later             |

## 2. What Supabase provides

- **Free plan: no backups**, and inactive projects are paused. Not acceptable once
  real people log data.
- **Pro plan** (~US$25/month): daily database backups kept 7 days, restorable from the
  dashboard (Database → Backups). Required before opening sign-ups.
- **Point-in-time recovery** (paid add-on on Pro): restore to any second in the
  retention window. Recommended once there are more than a handful of users.
- **Storage files are not in any database backup, on any plan.** Photos need the
  separate copy below.

## 3. Configuration (owner)

1. Upgrade the production project to Pro. Confirm Database → Backups lists a daily
   backup the next day.
2. Off-site encrypted dumps (defends against losing the Supabase account or project):
   - install `age` and create a key pair on a machine you control:
     `age-keygen -o reptr-backup.key` (keep this file offline; it's the only way to read
     the backups). The public key starts with `age1`.
   - weekly (daily once there are users):
     ```
     BACKUP_DATABASE_URL='<direct connection, port 5432>' \
     BACKUP_AGE_RECIPIENT='age1...' scripts/ops/backup-db.sh
     ```
   - keep the `.dump.age` files in storage you control (an encrypted drive, or a
     private bucket with object lock), 30 days.
3. Photos:
   ```
   SUPABASE_URL=https://cyouelhlhgeipxtvapcn.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY='<service role key>' \
   corepack pnpm tsx scripts/ops/backup-storage.ts
   ```
   Re-runs only fetch new files. Keep the folder on encrypted storage. A deleted
   account's photos must also be removed from this copy within 30 days (privacy policy).

## 4. Restore runbook

### A. Bad data or a bad migration, project still healthy

1. Stop the damage: in Vercel, promote the last good deployment (Deployments → ⋯ →
   Promote) so the bad code stops running.
2. Note the time just before the damage.
3. With PITR: Database → Backups → Point in time → that time. Without: restore the
   latest daily backup from before it. Supabase restores in place; the project is
   unavailable during the restore.
4. Check: `select count(*) from workouts; select max(finished_at) from workouts;` look
   right; sign in on a phone; open History.
5. Redeploy the fixed code. Write down what was lost between the backup and the incident.

### B. Project lost (deleted, account locked) → new project from the off-site dump

1. Create a new Supabase project in Singapore. Set Auth settings as in
   AUTH_EMAIL_SETUP.md.
2. Decrypt and restore:
   ```
   age -d -i reptr-backup.key reptr-db-<stamp>.dump.age > reptr.dump
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -d '<new project direct URL>' reptr.dump
   ```
   `auth.users` is restored with the same ids, so every row keeps its owner. Users sign
   in again by email (sessions don't carry over).
3. Recreate the bucket and policies: `DATABASE_URL=<new> corepack pnpm db:migrate`
   (migration 0002 is idempotent).
4. Upload photos back to the same paths (`<user id>/<file>`) with the service key.
5. Point Vercel's `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` at the new project; redeploy; update Auth URL settings.

### C. A migration failed halfway

Drizzle runs each migration file in a transaction, so a failed file leaves the database
as it was before that file. Fix the migration in a new commit (never edit one that has
already run anywhere), and run `corepack pnpm db:migrate` again. If a migration ran
but was wrong, write a new forward migration that corrects it; restore (A) only if
data was destroyed.

## 5. Restore drill (required before declaring backups done)

On the **staging** project, never production:

1. Load staging with test data (sign in, log two workouts, a weigh-in and a photo).
2. Take a dump with `backup-db.sh` and a photo copy with `backup-storage.ts`.
3. Create a scratch project, run runbook B against it, sign in as the test user and
   check the workouts, weigh-in and photo are there.
4. Record in the test report: date, dump size, minutes taken, what (if anything) failed.
5. Delete the scratch project.

Repeat every 3 months and after any change to the schema's ownership or auth setup.
