# Performance evidence

## P1-1 / D1–D2: foreign-key indexes (migration 0020)

Measured locally on Postgres 16 with `EXPLAIN (ANALYZE)`: one user with 100,000
personal-record rows, then the delete that every in-progress workout save runs (one
exercise with 20 sets, cascading to `workout_sets`, whose FK is checked against
`personal_records.set_id`).

|                                  | FK check on `personal_records`                 | Whole delete |
| -------------------------------- | ---------------------------------------------- | ------------ |
| Before (no index on `set_id`)    | 125.3 ms for 20 sets (sequential scan per set) | 125.6 ms     |
| After `personal_records_set_idx` | 0.30 ms                                        | 0.72 ms      |

The audit measured 1.74 s vs 2.2 ms on a larger table; the shape is the same: cost grew
with every record ever set, on every save. Script: kept in the PR description history;
it inserts the rows inside a transaction and rolls back.

Other indexes added, each because a cascading or set-null FK would otherwise scan the
table:

| Index                           | Triggered by                                    |
| ------------------------------- | ----------------------------------------------- |
| `personal_records(exercise_id)` | deleting a custom exercise                      |
| `goals(exercise_id)`            | deleting a custom exercise                      |
| `workouts(routine_id)`          | deleting a routine (`set null`)                 |
| `workout_sets(user_id)`         | deleting an account (cascade from `auth.users`) |
| `routine_exercises(user_id)`    | deleting an account                             |

Not added: `exercises(equipment_id)`. Equipment is shared reference data that is never
deleted by the app, so the FK is never checked from that side.

## P1-2: region

`vercel.json` pins functions to `sin1` (Singapore), the Supabase project's region. Each
server action makes 3–6 sequential database round trips (session check, rate limit,
the write, revalidation reads); from a US region each costs ~200 ms, from `sin1` ~2 ms.

**Not yet verified on the deployed project.** After the next deploy, check Vercel →
Project → Settings → Functions shows Singapore, and Observability → Functions p50/p95
for `POST /workout` (server actions). Targets: p50 < 150 ms, p95 < 400 ms.
