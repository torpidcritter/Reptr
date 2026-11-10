# Database security

How Reptr's server talks to Postgres, what row-level security (RLS) protects, and the
dashboard settings that have to match. Finding P1-8.

## Two ways the server queries

| Path                       | Connects as                   | RLS          | Used for                                                                                                                             |
| -------------------------- | ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `db` (`src/db/index.ts`)   | database owner (`postgres`)   | bypassed     | A user's own reads and writes, always filtered by `user_id` in code; audit log, rate limits, coach usage (users may not write these) |
| `withUser(db, userId, fn)` | `authenticated` role, per txn | **enforced** | Bulk reads of a user's data (export) and **every read that can return another person's data** (all social features)                  |

`withUser` (`src/db/with-user.ts`) opens a transaction, sets `request.jwt.claims` and
`request.jwt.claim.sub` with `set_config(…, true)` and runs `set local role
authenticated`. All three are transaction-local, so it is safe on Supabase's
transaction pooler (port 6543): nothing survives to the next request that reuses the
connection. Supabase's `auth.uid()` reads those settings, so the same policies that would
protect the Data API apply to these queries.

### Rule for new code

- A query that can return rows owned by someone else **must** run inside `withUser`.
  Social reads (feed, profiles, follows, leaderboards, groups) are written this way from
  the start, and their policies say who may see what.
- Owner-connection queries must filter by the signed-in user's id. Existing ones do;
  moving them all to `withUser` is not required for correctness and would add a
  transaction per request, so it is done where it adds protection (cross-user reads),
  not everywhere.
- Never pass a user id that came from the client to `withUser`. Use the session's id.

### What the tests prove

- `src/db/with-user.test.ts` (local Postgres with the same migrations): a user sees
  only their own rows, still reads shared rows (exercise library), can't insert rows for
  someone else, can read but not write the audit log, can't see rate limits, and the
  connection has no role left over afterwards.
- `src/integration/supabase-staging.test.ts` repeats the important part on a real
  Supabase project through the pooler: `current_user` is `authenticated`, `auth.uid()`
  is the user, only their profile row is visible, and the next query on the connection
  is back to the owner with no claims set. **Not yet run**: needs the staging project
  (see `STAGING_TESTS.md`).

## Supabase dashboard settings

| Setting                            | Required value                                                  | Why                                                                                                                                                              | Status           |
| ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| API → Data API → "Exposed schemas" | remove `public` (or turn the Data API off)                      | Reptr never uses the Data API from the browser. With `public` exposed, anyone with the anon key can query tables directly, and RLS is the only thing in the way. | **Not verified** |
| Database → Roles → `authenticated` | default grants (select/insert/update/delete on `public` tables) | `withUser` relies on them; RLS then narrows to the user's rows.                                                                                                  | Default; verify  |
| Database password                  | rotated                                                         | The password was shared in a chat during setup.                                                                                                                  | **Rotate**       |
| Vercel `DATABASE_URL`              | transaction pooler, port 6543, `aws-0-ap-southeast-1`           | Serverless functions open many short connections.                                                                                                                | Set              |

To check the Data API from a terminal (should fail or return `[]`):

```bash
curl "$SUPABASE_URL/rest/v1/profiles?select=user_id" -H "apikey: $ANON_KEY"
```

The staging suite's "keeps each user's rows to themselves through the Data API" test
checks the same thing with a signed-in user.

## RLS coverage

Every user table has an owner policy (`<table>_owner_all`), shared reference data has a
read policy, and server-only tables (`rate_limits`, `applied_ops`) have none, so the
`authenticated` role can't touch them. `src/db/rls.test.ts` fails if a new table is
added without RLS enabled.
