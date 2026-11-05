import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { activeProgram } from "@/modules/programs/programs";
import { listRoutines } from "@/modules/routines/routines";
import { applyProgram } from "./apply-program";
import { runTool, type Proposal } from "./tools";

describe.skipIf(!testDatabaseUrl)("program from a description", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const ctx = () => ({ db: t.db, userId: alice, timeZone: "UTC", now: new Date() });
  beforeAll(async () => {
    t = await createTestDatabase("program");
    await t.addUser(alice);
  });
  afterAll(() => t?.close());

  const upper = {
    exercises: [
      { exercise: "Barbell Bench Press", sets: 3, repsMin: 6, repsMax: 8 },
      { exercise: "Barbell Row", sets: 3, repsMin: 8, repsMax: 10 },
    ],
  };
  const lower = {
    exercises: [{ exercise: "Barbell Back Squat", sets: 4, repsMin: 5, repsMax: 6 }],
  };

  it("proposes routines on weekdays plus a block, then saves it on confirm", async () => {
    const out = await runTool(
      ctx(),
      "propose_program",
      JSON.stringify({
        name: "Upper/Lower",
        weeks: 8,
        deloadEvery: 4,
        routines: [
          { name: "Upper", days: ["Mon", "Thu"], ...upper },
          { name: "Lower", days: ["Tue", "Fri"], ...lower },
        ],
      }),
    );
    const p = out.proposal as Extract<Proposal, { kind: "create_program" }>;
    expect(p.kind).toBe("create_program");
    expect(p.payload.routines.map((r) => r.scheduleDays)).toEqual([
      [0, 3],
      [1, 4],
    ]);
    expect(p.summary).toMatch(/8 weeks, deload every 4 weeks/);
    expect(p.summary).toMatch(/Mon, Thu: Upper \(Barbell Bench Press 3×6–8/);

    await applyProgram(t.db, alice, p.payload, "2026-11-05");
    const routines = await listRoutines(t.db, alice);
    expect(routines.map((r) => r.name).sort()).toEqual(["Lower", "Upper"]);
    expect(await activeProgram(t.db, alice)).toMatchObject({
      name: "Upper/Lower",
      startDate: "2026-11-02",
      weeks: 8,
      deloadEvery: 4,
    });
  });

  it("refuses two routines on one day and unknown exercises", async () => {
    const twice = await runTool(
      ctx(),
      "propose_program",
      JSON.stringify({
        name: "X",
        weeks: 4,
        routines: [
          { name: "A", days: ["Mon"], ...upper },
          { name: "B", days: ["Mon"], ...lower },
        ],
      }),
    );
    expect(twice.proposal).toBeUndefined();
    expect(twice.result).toMatchObject({ error: expect.stringMatching(/Mon has both/) });

    const unknown = await runTool(
      ctx(),
      "propose_program",
      JSON.stringify({
        name: "X",
        weeks: 4,
        routines: [
          {
            name: "A",
            days: ["Mon"],
            exercises: [{ exercise: "Zzqx nonexistent", sets: 3, repsMin: 5, repsMax: 5 }],
          },
        ],
      }),
    );
    expect(unknown.result).toMatchObject({ error: expect.stringMatching(/No exercise matching/) });
  });
});
