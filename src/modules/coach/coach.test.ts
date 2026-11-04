import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { type ChatClient, runCoach } from "./agent";
import { runTool, toolDefinitions, tools } from "./tools";

describe("tool definitions", () => {
  it("exposes every tool with a JSON schema", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.function.name).sort()).toEqual(Object.keys(tools).sort());
    for (const d of defs) expect(d.function.parameters).toMatchObject({ type: "object" });
  });
});

describe.skipIf(!testDatabaseUrl)("coach", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const ctx = () => ({ db: t.db, userId: alice, timeZone: "UTC", now: new Date() });

  beforeAll(async () => {
    t = await createTestDatabase("coach");
    await t.addUser(alice);
    const [bench] = await t.sql`select id from exercises where slug = 'barbell-bench-press'`;
    for (const [daysAgo, kg] of [
      [9, 60],
      [5, 62.5],
      [1, 65],
    ]) {
      const start = new Date(Date.now() - daysAgo * 86400000);
      const w = emptyWorkout(start);
      w.startedAt = start.toISOString();
      const e = exerciseFor(
        { exerciseId: bench.id, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets: 2 },
      );
      e.sets.forEach((s) =>
        Object.assign(s, { weightKg: kg, reps: 8, completedAt: start.toISOString() }),
      );
      w.exercises.push(e);
      w.status = "completed";
      w.finishedAt = new Date(start.getTime() + 3600000).toISOString();
      await saveWorkoutSnapshot(t.db, alice, w);
    }
  });
  afterAll(() => t?.close());

  it("answers from real data", async () => {
    const { result } = await runTool(
      ctx(),
      "exercise_progress",
      JSON.stringify({ exercise: "bench press" }),
    );
    expect(result).toMatchObject({
      exercise: "Barbell Bench Press",
      sessionsLogged: 3,
      nextTime: { kind: "add_reps", weightKg: 65, reps: 9 },
    });
    const summary = (await runTool(ctx(), "training_summary", "{}")).result as {
      totals: { workouts: number };
    };
    expect(summary.totals.workouts).toBe(3);
  });

  it("rejects bad arguments without throwing", async () => {
    expect((await runTool(ctx(), "exercise_progress", "{}")).result).toHaveProperty("error");
    expect((await runTool(ctx(), "nope", "{}")).result).toHaveProperty("error");
    expect((await runTool(ctx(), "recent_workouts", "not json")).result).toHaveProperty("error");
  });

  it("turns data changes into proposals, never writes", async () => {
    const out = await runTool(
      ctx(),
      "propose_routine",
      JSON.stringify({
        name: "Upper A",
        exercises: [{ exercise: "Barbell Bench Press", sets: 3, repsMin: 6, repsMax: 10 }],
      }),
    );
    expect(out.result).toMatchObject({ status: "proposed" });
    expect(out.proposal).toMatchObject({ kind: "create_routine", payload: { name: "Upper A" } });
    const [{ n }] = await t.sql`select count(*)::int as n from routines where user_id = ${alice}`;
    expect(n).toBe(0);
  });

  it("loops through tool calls to a final answer", async () => {
    const calls: number[] = [];
    const fake: ChatClient = {
      chat: {
        completions: {
          create: async (req) => {
            calls.push(req.messages.length);
            if (calls.length === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "c1",
                          type: "function",
                          function: { name: "recent_workouts", arguments: '{"limit":2}' },
                        },
                        {
                          id: "c2",
                          type: "function",
                          function: {
                            name: "propose_weight_entry",
                            arguments: '{"weightKg":80.2}',
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            const toolMsg = req.messages.find((m) => m.role === "tool")!;
            expect(JSON.parse((toolMsg as { content: string }).content)).toHaveLength(2);
            return {
              choices: [{ message: { role: "assistant", content: "You trained twice recently." } }],
            };
          },
        },
      },
    };
    const out = await runCoach(fake, "test", ctx(), "system", [
      { role: "user", content: "How am I doing?" },
    ]);
    expect(out.reply).toBe("You trained twice recently.");
    expect(out.toolsUsed).toEqual(["recent_workouts", "propose_weight_entry"]);
    expect(out.proposals).toEqual([
      expect.objectContaining({
        kind: "log_weight",
        payload: expect.objectContaining({ weightKg: 80.2 }),
      }),
    ]);
  });
});
