// Fills the sample account with ~10 weeks of training, weigh-ins and check-ins, so
// charts and insights can be tried out. It only ever writes to DEMO_USER_ID, never to
// a real user, and creates that account if needed. View it with REPTR_DEMO=1.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Database } from "@/db/types";
import { entrySchema, logEntry } from "@/modules/body/body";
import { checkinSchema, saveCheckin } from "@/modules/recovery/recovery";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { DEMO_USER_ID } from "@/lib/demo";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");
const asked = process.argv[2];
if (asked && asked !== DEMO_USER_ID) {
  console.error(
    `Sample data only goes into the demo account (${DEMO_USER_ID}), never a real user's. ` +
      "Run `pnpm db:demo` with no user id.",
  );
  process.exit(1);
}
const userId = DEMO_USER_ID;

const days = [
  {
    name: "Push",
    lifts: [
      ["barbell-bench-press", 60, 8],
      ["overhead-press", 35, 8],
      ["triceps-pushdown", 25, 12],
    ],
  },
  {
    name: "Pull",
    lifts: [
      ["barbell-row", 55, 8],
      ["lat-pulldown", 50, 10],
      ["barbell-curl", 25, 10],
    ],
  },
  {
    name: "Legs",
    lifts: [
      ["barbell-back-squat", 80, 6],
      ["romanian-deadlift", 70, 8],
      ["lying-leg-curl", 35, 12],
    ],
  },
] as const;

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(sql, { schema }) as unknown as Database;
  await sql`insert into auth.users (id, email) values (${userId}, 'demo@reptr.local')
    on conflict (id) do nothing`;
  await sql`insert into profiles (user_id, display_name, unit_system, goal, training_days_per_week, onboarded_at)
    values (${userId}, 'Demo', 'metric', 'hypertrophy', 3, now())
    on conflict (user_id) do update set display_name = 'Demo',
      onboarded_at = coalesce(profiles.onboarded_at, now())`;
  const [{ n }] = await sql`select count(*)::int as n from workouts where user_id = ${userId}`;
  if (n > 0) {
    console.log("The demo account already has sample data. Nothing added.");
    await sql.end();
    return;
  }
  const rows = await sql`select id, slug, name, measurement from exercises where owner_id is null`;
  const bySlug = new Map(rows.map((r) => [r.slug as string, r]));
  let count = 0;
  for (let week = 10; week >= 1; week--) {
    for (const [i, day] of days.entries()) {
      const start = new Date(Date.now() - (week * 7 - i * 2) * 86400000);
      start.setHours(18, 0, 0, 0);
      const w = emptyWorkout(start);
      w.name = day.name;
      w.startedAt = start.toISOString();
      const progress = 10 - week;
      for (const [slug, base, reps] of day.lifts) {
        const ex = bySlug.get(slug);
        if (!ex) continue;
        const e = exerciseFor(
          { exerciseId: ex.id, name: ex.name, measurement: ex.measurement },
          { sets: 3 },
        );
        e.sets.forEach((s, n) => {
          s.weightKg = base + Math.floor(progress / 2) * 2.5;
          s.reps = reps + (progress % 2) * 2 - n;
          s.completedAt = new Date(
            start.getTime() + (count % 7) * 60000 + n * 180000,
          ).toISOString();
        });
        w.exercises.push(e);
      }
      w.status = "completed";
      w.finishedAt = new Date(start.getTime() + 55 * 60000).toISOString();
      await saveWorkoutSnapshot(db, userId, w);
      count++;
    }
  }
  // Weigh-ins most mornings, drifting down ~0.3 kg a week with day-to-day noise.
  let weighIns = 0;
  for (let d = 70; d >= 0; d--) {
    if (d % 7 === 3) continue;
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const noise = Math.sin(d * 1.7) * 0.6 + Math.cos(d * 0.9) * 0.4;
    const values: Record<string, number> = {
      weight: Math.round((82 - (70 - d) * 0.043 + noise) * 10) / 10,
    };
    if (d % 14 === 0) {
      values.waist = Math.round((88 - (70 - d) * 0.04) * 10) / 10;
      values.body_fat = Math.round((20 - (70 - d) * 0.03) * 10) / 10;
    }
    await logEntry(
      db,
      userId,
      entrySchema.parse({ day, values, bodyFatMethod: values.body_fat ? "scale" : null }),
    );
    weighIns++;
  }
  // Two weeks of recovery check-ins (not today, so the form starts empty).
  for (let d = 14; d >= 1; d--) {
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    await saveCheckin(
      db,
      userId,
      checkinSchema.parse({
        day,
        sleepHours: Math.round((7.2 + Math.sin(d * 1.3) * 0.9) * 4) / 4,
        sleepQuality: 3 + Math.round(Math.sin(d) * 1.2),
        energy: 3 + Math.round(Math.cos(d) * 1.2),
        soreness: 2 + (d % 3),
        stress: 2 + (d % 2),
        steps: Math.round(8500 + Math.sin(d * 0.8) * 3000),
      }),
    );
  }
  console.log(`Added ${count} workouts, ${weighIns} weigh-ins and 14 check-ins`);
  await sql.end();
}

main();
