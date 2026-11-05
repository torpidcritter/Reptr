import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { createCustomExercise, customExerciseSchema, DuplicateExerciseError } from "./custom";
import { getExercise, listExercises, similarExercises } from "./queries";

describe("custom exercise form", () => {
  const base = {
    name: "Cable Y Raise",
    category: "resistance",
    measurement: "weight_reps",
    primaryMuscle: "side-delts",
  };

  it("needs a name and a main muscle", () => {
    expect(customExerciseSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(customExerciseSchema.safeParse({ ...base, primaryMuscle: "" }).success).toBe(false);
  });

  it("drops the main muscle from the secondary list and reads the checkbox", () => {
    const v = customExerciseSchema.parse({
      ...base,
      secondaryMuscles: ["side-delts", "traps", "traps"],
      isUnilateral: "on",
    });
    expect(v.secondaryMuscles).toEqual(["traps"]);
    expect(v.isUnilateral).toBe(true);
  });
});

describe.skipIf(!testDatabaseUrl)("exercise library", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("exercises");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("lists the built-in library alphabetically with primary muscles", async () => {
    const all = await listExercises(t.db, alice);
    expect(all.length).toBeGreaterThanOrEqual(150);
    const names = all.map((e) => e.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    const bench = all.find((e) => e.name === "Barbell Bench Press")!;
    expect(bench.primaryMuscles).toEqual(["Chest"]);
    expect(bench.equipment).toBe("Barbell");
  });

  it("searches by name, ignoring case", async () => {
    const hits = await listExercises(t.db, alice, { q: "curl" });
    expect(hits.length).toBeGreaterThan(5);
    expect(hits.every((e) => /curl/i.test(e.name))).toBe(true);
  });

  it("treats % and _ in a search as plain text", async () => {
    expect(await listExercises(t.db, alice, { q: "%" })).toEqual([]);
  });

  it("filters by primary muscle and equipment together", async () => {
    const hits = await listExercises(t.db, alice, { muscle: "chest", equipment: "dumbbell" });
    expect(hits.map((e) => e.name)).toContain("Dumbbell Bench Press");
    expect(hits.every((e) => e.equipment === "Dumbbell")).toBe(true);
    expect(hits.every((e) => e.primaryMuscles.includes("Chest"))).toBe(true);
  });

  it("creates a custom exercise only its owner can see", async () => {
    const input = customExerciseSchema.parse({
      name: "Cable Y Raise",
      category: "resistance",
      measurement: "weight_reps",
      equipment: "cable",
      primaryMuscle: "side-delts",
      secondaryMuscles: ["traps"],
    });
    const { id } = await createCustomExercise(t.db, alice, input);

    const mine = await getExercise(t.db, alice, id);
    expect(mine).toMatchObject({ name: "Cable Y Raise", isCustom: true, equipment: "Cable" });
    expect(mine!.muscles).toEqual([
      { name: "Side delts", role: "primary", contribution: 1 },
      { name: "Traps", role: "secondary", contribution: 0.5 },
    ]);

    expect(await getExercise(t.db, bob, id)).toBeNull();
    expect((await listExercises(t.db, bob, { q: "Y Raise" })).length).toBe(0);
    expect((await listExercises(t.db, alice, { q: "Y Raise" })).map((e) => e.isCustom)).toEqual([
      true,
    ]);
  });

  it("refuses a duplicate name for the same user", async () => {
    const input = customExerciseSchema.parse({
      name: "cable y raise",
      category: "resistance",
      measurement: "weight_reps",
      primaryMuscle: "side-delts",
    });
    await expect(createCustomExercise(t.db, alice, input)).rejects.toBeInstanceOf(
      DuplicateExerciseError,
    );
    await expect(createCustomExercise(t.db, bob, input)).resolves.toHaveProperty("id");
  });

  it("suggests swaps that train the same muscles with the same movement", async () => {
    const [bench] = await listExercises(t.db, alice, { q: "Barbell Bench Press" });
    const similar = await similarExercises(t.db, alice, bench.id);
    const names = similar.map((e) => e.name);
    expect(names).not.toContain("Barbell Bench Press");
    expect(names.slice(0, 4)).toContain("Dumbbell Bench Press");
    expect(names).not.toContain("Barbell Back Squat");
    const db = similar.find((e) => e.name === "Dumbbell Bench Press")!;
    expect(db.reason).toBe("Same muscles · same movement · uses dumbbell");
    // Another user's custom exercises are never suggested.
    const [cable] = await listExercises(t.db, bob, { q: "cable y raise" });
    const delts = await similarExercises(t.db, alice, cable.id);
    expect(delts).toEqual([]);
  });

  it("gives every built-in exercise coaching notes and a difficulty", async () => {
    const [squat] = await listExercises(t.db, alice, { q: "Barbell Back Squat" });
    const detail = (await getExercise(t.db, alice, squat.id))!;
    expect(detail.difficulty).toBe("intermediate");
    expect(detail.formCues).toMatch(/brace/i);
    expect(detail.commonMistakes!.split("\n").length).toBeGreaterThan(1);
    expect(detail.safetyNotes).toMatch(/knee/i);
    const [{ missing }] = await t.sql`
      select count(*)::int as missing from exercises
      where owner_id is null and not is_archived
        and (form_cues is null or common_mistakes is null or safety_notes is null or difficulty is null)`;
    expect(missing).toBe(0);
  });
});
