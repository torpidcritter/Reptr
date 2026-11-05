import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { createCustomExercise, customExerciseSchema } from "@/modules/exercises/custom";
import { nextRoutine } from "@/modules/dashboard/dashboard";
import {
  archiveRoutine,
  duplicateRoutine,
  getRoutine,
  listRoutines,
  RoutineNotFoundError,
  routineSchema,
  saveRoutine,
} from "./routines";

const someId = "00000000-0000-4000-8000-000000000000";

describe("routine form", () => {
  it("needs a name and at least one exercise", () => {
    expect(routineSchema.safeParse({ name: "", items: [{ exerciseId: someId }] }).success).toBe(
      false,
    );
    expect(routineSchema.safeParse({ name: "Push", items: [] }).success).toBe(false);
  });

  it("turns blank targets into nulls", () => {
    const r = routineSchema.parse({
      name: "Push",
      items: [
        {
          exerciseId: someId,
          targetSets: "3",
          targetRepsMin: "",
          targetRepsMax: "12",
          restSeconds: "",
        },
      ],
    });
    expect(r.items[0]).toMatchObject({
      targetSets: 3,
      targetRepsMin: null,
      targetRepsMax: 12,
      restSeconds: null,
    });
  });

  it("catches a back-to-front rep range", () => {
    const r = routineSchema.safeParse({
      name: "Push",
      items: [{ exerciseId: someId, targetRepsMin: 12, targetRepsMax: 8 }],
    });
    expect(r.success).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("routines", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  const ex: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase("routines");
    await t.addUser(alice);
    await t.addUser(bob);
    const rows = await t.sql`select id, slug from exercises where owner_id is null`;
    for (const r of rows) ex[r.slug] = r.id;
  });
  afterAll(() => t?.close());

  const push = () =>
    routineSchema.parse({
      name: "Push",
      items: [
        {
          exerciseId: ex["barbell-bench-press"],
          targetSets: 3,
          targetRepsMin: 6,
          targetRepsMax: 8,
          restSeconds: 180,
        },
        {
          exerciseId: ex["incline-dumbbell-press"],
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 12,
        },
        { exerciseId: ex["dumbbell-lateral-raise"], targetSets: 3, supersetGroup: 1 },
        { exerciseId: ex["triceps-pushdown"], targetSets: 3, supersetGroup: 1 },
      ],
    });

  it("saves a routine in order and lists it", async () => {
    const { id } = await saveRoutine(t.db, alice, push());
    const r = await getRoutine(t.db, alice, id);
    expect(r!.items.map((i) => i.exerciseName)).toEqual([
      "Barbell Bench Press",
      "Incline Dumbbell Press",
      "Dumbbell Lateral Raise",
      "Triceps Pushdown",
    ]);
    expect(r!.items[0]).toMatchObject({
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 8,
      restSeconds: 180,
    });
    expect(r!.items[2].supersetGroup).toBe(1);

    const list = await listRoutines(t.db, alice);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Push", exerciseCount: 4, scheduleDays: [] });
    expect(await listRoutines(t.db, bob)).toEqual([]);
    expect(await getRoutine(t.db, bob, id)).toBeNull();
  });

  it("schedules a routine on weekdays and suggests it on those days", async () => {
    const legs = routineSchema.parse({
      name: "Legs",
      scheduleDays: [4, 0, 4],
      items: [{ exerciseId: ex["barbell-back-squat"] }],
    });
    expect(legs.scheduleDays).toEqual([0, 4]);
    expect(routineSchema.safeParse({ ...legs, scheduleDays: [7] }).success).toBe(false);
    const { id } = await saveRoutine(t.db, alice, legs);
    expect((await getRoutine(t.db, alice, id))!.scheduleDays).toEqual([0, 4]);
    const setAt = async () =>
      (await listRoutines(t.db, alice)).find((r) => r.id === id)!.scheduleSetAt!.getTime();
    const first = await setAt();
    await saveRoutine(t.db, alice, { ...legs, name: "Legs A" }, id);
    expect(await setAt()).toBe(first); // a rename keeps the plan's start date
    await saveRoutine(t.db, alice, { ...legs, scheduleDays: [0, 3] }, id);
    expect(await setAt()).toBeGreaterThan(first);

    expect((await nextRoutine(t.db, alice, 4))!.name).toBe("Legs"); // Friday
    expect((await nextRoutine(t.db, alice, 2))!.plannedToday).toBe(false);

    const { id: copy } = await duplicateRoutine(t.db, alice, id);
    expect((await getRoutine(t.db, alice, copy))!.scheduleDays).toEqual([]);
    await archiveRoutine(t.db, alice, id);
    await archiveRoutine(t.db, alice, copy);
  });

  it("reorders and edits by replacing the contents", async () => {
    const [{ id }] = await listRoutines(t.db, alice);
    const input = push();
    input.name = "Push A";
    input.items = [input.items[1], input.items[0]];
    await saveRoutine(t.db, alice, input, id);
    const r = await getRoutine(t.db, alice, id);
    expect(r!.name).toBe("Push A");
    expect(r!.items.map((i) => i.exerciseName)).toEqual([
      "Incline Dumbbell Press",
      "Barbell Bench Press",
    ]);
  });

  it("won't let someone else edit or use another person's exercises", async () => {
    const [{ id }] = await listRoutines(t.db, alice);
    await expect(saveRoutine(t.db, bob, push(), id)).rejects.toBeInstanceOf(RoutineNotFoundError);

    const custom = await createCustomExercise(
      t.db,
      alice,
      customExerciseSchema.parse({
        name: "Secret Lift",
        category: "resistance",
        measurement: "weight_reps",
        primaryMuscle: "chest",
      }),
    );
    const sneaky = routineSchema.parse({ name: "Mine", items: [{ exerciseId: custom.id }] });
    await expect(saveRoutine(t.db, bob, sneaky)).rejects.toBeInstanceOf(RoutineNotFoundError);
    await expect(saveRoutine(t.db, alice, sneaky)).resolves.toHaveProperty("id");
  });

  it("duplicates and archives", async () => {
    const [{ id }] = await listRoutines(t.db, alice);
    const copy = await duplicateRoutine(t.db, alice, id);
    expect((await getRoutine(t.db, alice, copy.id))!.name).toMatch(/\(copy\)$/);
    await archiveRoutine(t.db, alice, copy.id);
    expect(await getRoutine(t.db, alice, copy.id)).toBeNull();
    expect((await listRoutines(t.db, alice)).map((r) => r.id)).not.toContain(copy.id);
  });
});
