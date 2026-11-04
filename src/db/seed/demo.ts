// Fills a development database with ~10 weeks of training for one user, so charts,
// records and insights have something to show. Never run it against real data.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Database } from "@/db/types";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";

const url = process.env.DATABASE_URL;
const userId = process.argv[2] ?? process.env.REPTR_DEV_USER_ID;
if (!url || !userId) throw new Error("Set DATABASE_URL and pass a user id");

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
      await saveWorkoutSnapshot(db, userId!, w);
      count++;
    }
  }
  console.log(`Added ${count} workouts`);
  await sql.end();
}

main();
