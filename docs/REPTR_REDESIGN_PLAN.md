# Reptr redesign plan

The goal is to make the five daily things effortless (start a workout, log sets, log weight, see the week, understand progress), and to keep everything else one level down.

## Navigation

| Tab      | Holds                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Today    | Greeting, Start workout, today's plan, week strip, Log weight, Log food (if nutrition is on), one insight |
| Train    | Start workout, routines, exercise library, active session                                                 |
| Progress | Strength, body weight and measurements, consistency, records, history, muscle split; "Advanced" collapsed |
| Plan     | Month calendar, weekly schedule, routines, programs, goals                                                |
| Coach    | AI coach                                                                                                  |

Profile, settings, data export, achievements, nutrition and recovery move behind the avatar menu or into optional modules. On desktop, a compact sidebar; on mobile, a bottom bar with safe-area padding.

## Phases (one pull request each, merged when CI is green)

1. **Audit:** these docs, plus the dev-origin fix (F1, F7).
2. **Navigation and design tokens:** five tabs, an avatar menu, the type scale, spacing, fewer cards, and a shared confirm dialog (F5).
3. **Fresh user:** demo isolation (F3), new onboarding (U4) and empty states (U5).
4. **Weight:** a Log weight sheet everywhere, and history with edit and delete (F4).
5. **Today and Start workout:** U2, U3 and F8.
6. **Plan:** the calendar redesign with day detail (U7).
7. **Progress:** plain-language progress with Advanced collapsed (U6), and weight moved in (U10).
8. **Picker filters:** filter chips in the shared exercise picker (U8).
9. **Optional modules:** a settings toggle for nutrition and recovery.
10. **Validation:** E2E for every journey in the audit, screenshots, `docs/REPTR_TEST_REPORT.md`, and the laptop launcher switched to a production build.
