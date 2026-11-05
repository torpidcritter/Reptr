// Tools the coach can call. Read tools return numbers computed by Reptr's own analytics,
// so the model explains real data rather than guessing. Tools that would change data never
// run here: they return a proposal that the user confirms in the app.

import { z } from "zod";
import type { Database } from "@/db/types";
import { buildInsights, lastWeeks, localDay } from "@/modules/analytics/insights";
import { insightData } from "@/modules/analytics/insights-queries";
import { isPlateau, sessionStats, suggestNext } from "@/modules/analytics/progression";
import { exerciseRecords, exerciseSessions } from "@/modules/analytics/records";
import { metricSeries } from "@/modules/body/body";
import { dailyReadings, trendLine, weeklyRate } from "@/modules/body/trend";
import { listExercises } from "@/modules/exercises/queries";
import { listWorkoutHistory } from "@/modules/history/history";
import { dailyTotals, getTargets } from "@/modules/nutrition/nutrition";
import { loadRatio, readiness } from "@/modules/recovery/readiness";
import { checkinRange, volumeBetween } from "@/modules/recovery/recovery";
import { listRoutines } from "@/modules/routines/routines";
import { fatigueFor } from "./fatigue-queries";
import { memoryKinds } from "./memory";
import { sessionReviewFor, workoutOnOrBefore } from "./review-queries";

export type CoachContext = { db: Database; userId: string; timeZone: string; now: Date };

type RoutineItem = {
  exerciseId: string;
  exercise: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
};

export type Proposal =
  | {
      kind: "create_routine";
      summary: string;
      payload: { name: string; items: RoutineItem[] };
    }
  | { kind: "log_weight"; summary: string; payload: { day: string; weightKg: number } }
  | {
      kind: "create_program";
      summary: string;
      payload: {
        name: string;
        weeks: number;
        deloadEvery: number | null;
        routines: { name: string; scheduleDays: number[]; items: RoutineItem[] }[];
      };
    }
  | {
      kind: "remember";
      summary: string;
      payload: { kind: (typeof memoryKinds)[number]; content: string };
    };

type Tool = {
  description: string;
  parameters: z.ZodType;
  run: (ctx: CoachContext, args: never) => Promise<unknown>;
  /** Data-changing tools return a proposal for the user to confirm. */
  proposes?: boolean;
};

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const day = (d: Date, tz: string) => localDay(d, tz);
const daysAgo = (ctx: CoachContext, n: number) =>
  day(new Date(ctx.now.getTime() - n * 86400000), ctx.timeZone);

async function findExercise(ctx: CoachContext, name: string) {
  const rows = await listExercises(ctx.db, ctx.userId, { q: name });
  const exact = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  return exact ?? rows[0] ?? null;
}

const exerciseListSchema = z
  .array(
    z.object({
      exercise: z.string().min(2),
      sets: z.number().int().min(1).max(10),
      repsMin: z.number().int().min(1).max(50),
      repsMax: z.number().int().min(1).max(50),
      restSeconds: z.number().int().min(0).max(600).optional(),
    }),
  )
  .min(1)
  .max(12);

/** Matches exercise names to the library, or explains which one wasn't found. */
async function resolveItems(
  ctx: CoachContext,
  exercises: z.infer<typeof exerciseListSchema>,
): Promise<RoutineItem[] | { error: string }> {
  const items: RoutineItem[] = [];
  for (const e of exercises) {
    const ex = await findExercise(ctx, e.exercise);
    if (!ex)
      return { error: `No exercise matching "${e.exercise}". Search with find_exercises first.` };
    items.push({
      exerciseId: ex.id,
      exercise: ex.name,
      targetSets: e.sets,
      targetRepsMin: Math.min(e.repsMin, e.repsMax),
      targetRepsMax: Math.max(e.repsMin, e.repsMax),
      restSeconds: e.restSeconds ?? null,
    });
  }
  return items;
}

const describeItems = (items: RoutineItem[]) =>
  items
    .map((i) => `${i.exercise} ${i.targetSets}×${i.targetRepsMin}–${i.targetRepsMax}`)
    .join(", ");

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const tool = <S extends z.ZodType>(t: {
  description: string;
  parameters: S;
  run: (ctx: CoachContext, args: z.infer<S>) => Promise<unknown>;
  proposes?: boolean;
}): Tool => t as unknown as Tool;

export const tools: Record<string, Tool> = {
  training_summary: tool({
    description:
      "Training totals for the last N weeks: workouts, working sets, volume (kg), change vs the previous period, weekly sets per muscle, and the most-trained lifts' estimated 1RM trend.",
    parameters: z.object({ weeks: z.number().int().min(1).max(52).default(8) }),
    run: async (ctx, { weeks }) => {
      const ws = lastWeeks(day(ctx.now, ctx.timeZone), weeks);
      const from = new Date(`${ws[0]}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 7 * weeks - 1);
      const { sets, links } = await insightData(ctx.db, ctx.userId, from);
      const i = buildInsights(sets, links, ws, ctx.timeZone);
      return {
        weeks,
        totals: {
          ...i.totals,
          volume: Math.round(i.totals.volume),
          minutes: Math.round(i.totals.minutes),
        },
        previousPeriod: { ...i.previous, volume: Math.round(i.previous.volume) },
        perWeek: i.weekly.map((w) => ({
          week: w.week,
          workouts: w.workouts,
          sets: w.sets,
          volumeKg: Math.round(w.volume),
        })),
        weeklySetsPerMuscle: Object.fromEntries(i.muscleAvg.map((m) => [m.muscle, r1(m.avg)])),
        topLifts: i.topLifts.map((l) => ({
          exercise: l.name,
          firstE1rmKg: l.points[0].y,
          latestE1rmKg: l.points.at(-1)!.y,
          sessions: l.points.length,
        })),
      };
    },
  }),

  exercise_progress: tool({
    description:
      "History and progression for one exercise by name: recent sessions, personal records, plateau check, and Reptr's double-progression target for next time.",
    parameters: z.object({ exercise: z.string().min(2) }),
    run: async (ctx, { exercise }) => {
      const ex = await findExercise(ctx, exercise);
      if (!ex) return { error: `No exercise matching "${exercise}".` };
      const [sessions, records] = await Promise.all([
        exerciseSessions(ctx.db, ctx.userId, ex.id, 20),
        exerciseRecords(ctx.db, ctx.userId, ex.id),
      ]);
      const stats = sessions.map(sessionStats);
      return {
        exercise: ex.name,
        sessionsLogged: sessions.length,
        recentSessions: sessions.slice(-6).map((s, i, arr) => ({
          date: s.date.slice(0, 10),
          sets: s.sets.map((x) => ({ type: x.type, weightKg: x.weightKg, reps: x.reps })),
          bestE1rmKg: stats[stats.length - arr.length + i].bestE1rm,
        })),
        records: records.map((r) => ({
          type: r.type,
          value: r.value,
          date: r.achievedAt.toISOString().slice(0, 10),
        })),
        plateau: isPlateau(stats.map((s) => s.bestE1rm ?? s.bestReps)),
        nextTime:
          ex.measurement === "weight_reps" || ex.measurement === "reps"
            ? suggestNext(sessions.at(-1)?.sets, { weighted: ex.measurement === "weight_reps" })
            : null,
      };
    },
  }),

  recent_workouts: tool({
    description: "The most recent completed workouts with date, name, sets, volume and exercises.",
    parameters: z.object({ limit: z.number().int().min(1).max(20).default(8) }),
    run: async (ctx, { limit }) =>
      (await listWorkoutHistory(ctx.db, ctx.userId, { limit })).map((w) => ({
        date: day(w.startedAt, ctx.timeZone),
        name: w.name,
        minutes: w.finishedAt
          ? Math.round((w.finishedAt.getTime() - w.startedAt.getTime()) / 60000)
          : null,
        sets: w.setCount,
        volumeKg: Math.round(w.volumeKg),
        exercises: w.exerciseNames,
      })),
  }),

  body_trend: tool({
    description:
      "Body-weight trend (smoothed), weekly rate of change over 4 weeks, and the last 10 daily weigh-ins.",
    parameters: z.object({}),
    run: async (ctx) => {
      const rows = await metricSeries(ctx.db, ctx.userId, "weight");
      const daily = dailyReadings(rows);
      const trend = trendLine(daily);
      return {
        latestTrendKg: r1(trend.at(-1)?.value),
        weeklyRateKg: weeklyRate(trend),
        recentWeighIns: daily.slice(-10).map((d) => ({ day: d.day, kg: r1(d.value) })),
      };
    },
  }),

  nutrition_summary: tool({
    description: "Daily calories and protein for the last N days against the user's targets.",
    parameters: z.object({ days: z.number().int().min(1).max(60).default(7) }),
    run: async (ctx, { days }) => {
      const [targets, totals] = await Promise.all([
        getTargets(ctx.db, ctx.userId),
        dailyTotals(ctx.db, ctx.userId, daysAgo(ctx, days - 1), daysAgo(ctx, 0)),
      ]);
      return {
        targets: targets && {
          calories: targets.calories,
          proteinG: targets.proteinG,
          waterMl: targets.waterMl,
        },
        daysLogged: totals.length,
        days: totals.map((t) => ({ day: t.day, calories: t.calories, proteinG: r1(t.proteinG) })),
      };
    },
  }),

  recovery_summary: tool({
    description:
      "Recent daily check-ins (sleep, energy, soreness, stress, steps), today's readiness score and training load ratio.",
    parameters: z.object({ days: z.number().int().min(1).max(30).default(7) }),
    run: async (ctx, { days }) => {
      const now = ctx.now;
      const ago = (n: number) => new Date(now.getTime() - n * 86400000);
      const [checkins, last7, last28] = await Promise.all([
        checkinRange(ctx.db, ctx.userId, daysAgo(ctx, days - 1), daysAgo(ctx, 0)),
        volumeBetween(ctx.db, ctx.userId, ago(7), now),
        volumeBetween(ctx.db, ctx.userId, ago(28), now),
      ]);
      const ratio = loadRatio(last7, last28);
      const today = checkins.find((c) => c.day === daysAgo(ctx, 0)) ?? null;
      return {
        readinessToday: readiness(today, ratio),
        loadRatio: ratio,
        checkins: checkins.map((c) => ({
          day: c.day,
          sleepHours: c.sleepHours,
          sleepQuality: c.sleepQuality,
          energy: c.energy,
          soreness: c.soreness,
          stress: c.stress,
          steps: c.steps,
        })),
      };
    },
  }),

  fatigue_check: tool({
    description:
      "Reptr's read of accumulated fatigue over recent weeks: level (fresh, normal, building, deload), the reasons behind it, a confidence label and how many hard weeks in a row. Use for questions about tiredness, stalls or whether to deload.",
    parameters: z.object({}),
    run: async (ctx) => fatigueFor(ctx.db, ctx.userId, ctx.timeZone, ctx.now),
  }),

  review_workout: tool({
    description:
      "Rule-based review of one completed workout: headline, points that went well or need watching, and each exercise's change vs its recent sessions. Defaults to the latest workout; pass a date (YYYY-MM-DD) for the latest one on or before it.",
    parameters: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    run: async (ctx, { date }) => {
      const id = await workoutOnOrBefore(ctx.db, ctx.userId, date);
      if (!id) return { error: "No completed workout found around then." };
      return sessionReviewFor(ctx.db, ctx.userId, id, ctx.timeZone);
    },
  }),

  list_routines: tool({
    description: "The user's saved routines with their exercises.",
    parameters: z.object({}),
    run: async (ctx) =>
      (await listRoutines(ctx.db, ctx.userId)).map((r) => ({
        name: r.name,
        exercises: r.exerciseNames,
      })),
  }),

  find_exercises: tool({
    description:
      "Search the exercise library by name, e.g. 'row' or 'lateral raise'. Use exact names from here when proposing a routine.",
    parameters: z.object({ query: z.string().min(2) }),
    run: async (ctx, { query }) =>
      (await listExercises(ctx.db, ctx.userId, { q: query })).slice(0, 12).map((e) => ({
        name: e.name,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles,
      })),
  }),

  propose_routine: tool({
    description:
      "Propose a new routine. Nothing is saved until the user confirms it in the app. Use exercise names from find_exercises.",
    proposes: true,
    parameters: z.object({ name: z.string().min(1).max(60), exercises: exerciseListSchema }),
    run: async (ctx, { name, exercises }): Promise<Proposal | { error: string }> => {
      const items = await resolveItems(ctx, exercises);
      if ("error" in items) return items;
      return {
        kind: "create_routine",
        summary: `Create routine "${name}": ${describeItems(items)}`,
        payload: { name, items },
      };
    },
  }),

  propose_program: tool({
    description:
      "Propose a whole program from the user's description: several routines, the weekdays each one is on, and a training block of N weeks with an optional deload every few weeks. It starts this week. Nothing is saved until the user confirms. Use exercise names from find_exercises and respect what you know about their injuries and equipment.",
    proposes: true,
    parameters: z.object({
      name: z.string().min(1).max(80),
      weeks: z.number().int().min(2).max(16),
      deloadEvery: z.number().int().min(3).max(8).nullable().optional(),
      routines: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            days: z.array(z.enum(weekdays)).min(1).max(7),
            exercises: exerciseListSchema,
          }),
        )
        .min(1)
        .max(7),
    }),
    run: async (
      ctx,
      { name, weeks, deloadEvery, routines },
    ): Promise<Proposal | { error: string }> => {
      const taken = new Map<number, string>();
      const out = [];
      for (const r of routines) {
        const scheduleDays = [...new Set(r.days.map((d) => weekdays.indexOf(d)))].sort();
        for (const d of scheduleDays) {
          if (taken.has(d))
            return {
              error: `${weekdays[d]} has both "${taken.get(d)}" and "${r.name}". Give each day one routine.`,
            };
          taken.set(d, r.name);
        }
        const items = await resolveItems(ctx, r.exercises);
        if ("error" in items) return items;
        out.push({ name: r.name, scheduleDays, items });
      }
      const summary = [
        `Start "${name}": ${weeks} weeks${deloadEvery ? `, deload every ${deloadEvery} weeks` : ", no planned deload"}, from this week.`,
        ...out.map(
          (r) =>
            `${r.scheduleDays.map((d) => weekdays[d]).join(", ")}: ${r.name} (${describeItems(r.items)})`,
        ),
      ].join("\n");
      return {
        kind: "create_program",
        summary,
        payload: { name, weeks, deloadEvery: deloadEvery ?? null, routines: out },
      };
    },
  }),

  propose_memory: tool({
    description:
      "Propose remembering something lasting the user told you (an injury or limitation, a preference, their equipment or schedule) so future conversations take it into account. Saved only after the user confirms. Don't use it for one-off details.",
    proposes: true,
    parameters: z.object({
      kind: z.enum(memoryKinds),
      content: z.string().min(3).max(300),
    }),
    run: async (_ctx, { kind, content }): Promise<Proposal> => ({
      kind: "remember",
      summary: `Remember: ${content.trim()}`,
      payload: { kind, content: content.trim() },
    }),
  }),

  propose_weight_entry: tool({
    description:
      "Propose logging a body-weight reading the user told you about. Saved only after the user confirms.",
    proposes: true,
    parameters: z.object({
      weightKg: z.number().min(20).max(400),
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    run: async (ctx, { weightKg, day: d }): Promise<Proposal> => {
      const when = d ?? daysAgo(ctx, 0);
      return {
        kind: "log_weight",
        summary: `Log body weight ${r1(weightKg)} kg on ${when}`,
        payload: { day: when, weightKg: r1(weightKg)! },
      };
    },
  }),
};

/** OpenAI function-tool definitions generated from the zod schemas. */
export function toolDefinitions() {
  return Object.entries(tools).map(([name, t]) => ({
    type: "function" as const,
    function: {
      name,
      description: t.description,
      parameters: z.toJSONSchema(t.parameters, { io: "input" }) as Record<string, unknown>,
    },
  }));
}

/** Runs a tool call from the model. Bad arguments come back as an error the model can fix. */
export async function runTool(ctx: CoachContext, name: string, rawArgs: string) {
  const t = tools[name];
  if (!t) return { result: { error: `Unknown tool ${name}` } };
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { result: { error: "Arguments were not valid JSON." } };
  }
  const parsed = t.parameters.safeParse(args);
  if (!parsed.success)
    return { result: { error: parsed.error.issues.map((i) => i.message).join("; ") } };
  const result = await t.run(ctx, parsed.data as never);
  if (t.proposes && result && typeof result === "object" && "kind" in result) {
    return {
      result: {
        status: "proposed",
        note: "Shown to the user to confirm. Not saved yet.",
        summary: (result as Proposal).summary,
      },
      proposal: result as Proposal,
    };
  }
  return { result };
}
