# Reptr test report

Date: 2026-11-05. Covers the product overhaul in PRs #42 to #48.

## Results

| Check                           | Result                                              |
| ------------------------------- | --------------------------------------------------- |
| Typecheck and lint              | Pass, no warnings                                   |
| Unit and integration tests      | 188 pass (47 files), real Postgres                  |
| End-to-end (Playwright)         | 15 pass: 14 on desktop Chrome, 1 on a Pixel 7 phone |
| Production build (`pnpm build`) | Pass                                                |
| Browser `confirm()` popups left | None                                                |

## Journeys covered end to end

| Journey                                                                                          | Test                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------- |
| A new account goes through onboarding, gets a first weigh-in and sees no sample data             | `accounts.spec.ts`            |
| Two people only ever see their own workouts and weigh-ins                                        | `accounts.spec.ts`            |
| Start an empty workout, add an exercise, log a set, finish (in-app dialog), see the summary      | `journeys.spec.ts`            |
| Log weight from Today, see it after a reload, edit it, delete it                                 | `journeys.spec.ts`            |
| Build a routine using the Muscle and Equipment filters, reopen it, start it, discard the workout | `plan-and-settings.spec.ts`   |
| Sets logged offline show "saved on this device", then save once the connection is back           | `plan-and-settings.spec.ts`   |
| Food logged offline syncs once, with no duplicate                                                | `journeys.spec.ts`            |
| Calendar marks the day a workout was done; tapping it lists the workout and opens it             | `journeys.spec.ts`            |
| Progress explains strength in a sentence and lists the workout just logged                       | `journeys.spec.ts`            |
| Settings keep training days after saving twice; turning Nutrition on adds Log food to Today      | `plan-and-settings.spec.ts`   |
| Daily check-in, food log and weekly report                                                       | `journeys.spec.ts`            |
| Download your data (JSON) and see it in account activity                                         | `journeys.spec.ts`            |
| Buttons work when the app is opened at 127.0.0.1 (the "exercises aren't added" bug)              | `plan-and-settings.spec.ts`   |
| Phone: the bottom bar reaches Today, Train, Progress, Plan, Coach and Profile                    | `journeys.spec.ts` (`@phone`) |

## Audit items

| Item | Status                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| F1   | Fixed and tested (127.0.0.1 E2E). The laptop moves to a production build, which never had the block.                           |
| F2   | Fixed by the production build on the laptop (pages are prebuilt, no compile on first visit).                                   |
| F3   | Fixed and tested. Sample data goes only to the demo user, with a banner. Real accounts start empty.                            |
| F4   | Fixed and tested. Log weight sheet from Today and Body, with history, edit and delete.                                         |
| F5   | Fixed. Every confirmation is an in-app dialog; E2E clicks through the Finish and Discard dialogs.                              |
| F6   | Mitigated, not closed. Every query filters by user and the two-user E2E passes, but the server still connects as the DB owner. |
| F7   | Fixed by the production build. Still visible in dev mode only.                                                                 |
| F8   | Fixed. Today shows weight and estimated-max records only.                                                                      |
| U1   | Done: five tabs, Profile behind the avatar button.                                                                             |
| U2   | Done: greeting, Start workout, week strip, Log weight, optional Log food and Check in, one insight.                            |
| U3   | Done: Start empty workout leads, routines below.                                                                               |
| U4   | Done: onboarding asks weight, goal, experience, weekdays and equipment.                                                        |
| U5   | Done for Today, Progress, Body, History and Plan.                                                                              |
| U6   | Done: plain-language Progress; the old page is now "Detailed analysis".                                                        |
| U7   | Done: clean month grid, day detail, one-line week summary. Uses routine days, or the days picked in settings.                  |
| U8   | Done and tested: Muscle and Equipment filters in the one shared picker.                                                        |
| U9   | Partly done: fewer cards on the new pages. Older pages (Detailed analysis, Programs) still use the old card style.             |
| U10  | Done: weight lives under Progress and Body; nutrition and recovery are optional modules turned on in settings.                 |

## Screenshots

Phone width (390 px), production build, demo account. In `docs/screenshots/`:
`today.png`, `train.png`, `start-workout.png`, `log-weight.png`, `exercise-picker.png`, `progress.png`, `plan.png`, `body.png`, `profile.png`.

## Blockers (need the owner)

1. **Supabase project:** URL, anon key and database URL. Until then sign-in, password reset and progress-photo storage are untested against the real service; locally a fixed user stands in.
2. **OpenAI API key:** the Coach tab replies "The coach needs an OpenAI API key" until a key is set.
3. **Vercel deploy:** needs the repo connected and the environment variables above.
4. **Database role (F6):** in production, run server queries as a non-owner role (or `set local role authenticated`) so row-level security applies as a second line of defence.

## Not covered by automated tests

- Imperial units on every form (unit conversion has unit tests; only metric runs end to end).
- Real phone hardware and an installed PWA. Phone layout is tested with Playwright's Pixel 7 profile.
- Two devices editing the same workout at once (covered by integration tests, not in the browser).
